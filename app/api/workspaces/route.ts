import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  readPrimaryUserId,
  readUserIds,
} from "@/lib/session";
import {
  countNewFindingsByAgent,
  createWorkspace,
  findSingleWorkspaceForProperty,
  findUnionWorkspaceForPropertySet,
  getDb,
  getPropertiesByIds,
  listWorkspaces,
} from "@/lib/db";
import {
  bumpWorkspaceUsage,
  resolveActiveWorkspace,
} from "@/lib/workspace";
import type { DoctorReport } from "@/lib/doctor";

export async function GET() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const workspaces = listWorkspaces({ user_ids: userIds, include_archived: true });

  // Single SQL pass for unread counts grouped by workspace_id (was N+1 listFindings before).
  const userPlaceholders = userIds.map(() => "?").join(",");
  const unreadRows = getDb()
    .prepare(
      `SELECT workspace_id, COUNT(*) as n
       FROM findings
       WHERE status = 'new' AND user_id IN (${userPlaceholders})
       GROUP BY workspace_id`
    )
    .all(...userIds) as Array<{ workspace_id: number; n: number }>;
  const unreadByWs = new Map<number, number>(
    unreadRows.map((r) => [r.workspace_id, r.n])
  );

  // Bulk fetch all attached properties in one query (was N getPropertiesByIds before).
  const allPropIds = workspaces.flatMap((w) => safeParseIds(w.ga4_property_ids));
  const uniquePropIds = Array.from(new Set(allPropIds));
  const propsByIdArr = uniquePropIds.length > 0 ? getPropertiesByIds(uniquePropIds) : [];
  const propMap = new Map(propsByIdArr.map((p) => [p.id, p]));

  // Per-workspace enrichment — now all in-memory lookups, no extra queries.
  const enriched = workspaces.map((w) => {
    const propIds = safeParseIds(w.ga4_property_ids);
    const props = propIds
      .map((id) => propMap.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    const unread = unreadByWs.get(w.id) ?? 0;
    // Activity = max across attached properties; mismatch = any property flagged
    let maxActivity = 0;
    let hasActivity = false;
    let anyMismatch = false;
    let anyDoctor = false;
    for (const p of props) {
      if (!p.doctor_json) continue;
      anyDoctor = true;
      try {
        const r = JSON.parse(p.doctor_json) as DoctorReport;
        if (r.is_active) hasActivity = true;
        if (r.activity_score > maxActivity) maxActivity = r.activity_score;
        if (r.host_mismatch) anyMismatch = true;
      } catch {
        // skip malformed
      }
    }
    return {
      id: w.id,
      user_id: w.user_id,
      name: w.name,
      kind: w.kind,
      primary_property_id: w.primary_property_id,
      property_ids: propIds,
      property_count: propIds.length,
      last_used_at: w.last_used_at,
      last_scan_at: w.last_scan_at,
      archived: w.archived === 1,
      unread_count: unread,
      activity_score: maxActivity,
      is_active: hasActivity,
      host_mismatch: anyMismatch,
      doctor_checked: anyDoctor,
      website_url: props.find((p) => p.website_url)?.website_url ?? null,
    };
  });

  const active = resolveActiveWorkspace(session);
  return NextResponse.json(
    {
      workspaces: enriched,
      active_workspace_id: active?.id ?? null,
    },
    {
      headers: {
        // Browser caches per session for snappy back-and-forth nav. Server-side
        // stays authoritative; revalidation fires in the background.
        "Cache-Control": "private, max-age=10, stale-while-revalidate=60",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  const primaryUserId = readPrimaryUserId(session);
  if (!primaryUserId || userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    property_ids?: number[];
    activate?: boolean;
  };

  const propertyIds = (body.property_ids || []).filter((n) => Number.isFinite(n));
  if (propertyIds.length === 0) {
    return NextResponse.json({ error: "no_properties" }, { status: 400 });
  }

  // Validate ownership: every property must belong to one of the session's users
  const props = getPropertiesByIds(propertyIds);
  if (props.length !== propertyIds.length) {
    return NextResponse.json({ error: "property_not_found" }, { status: 404 });
  }
  for (const p of props) {
    if (!userIds.includes(p.user_id)) {
      return NextResponse.json({ error: "not_authorized" }, { status: 403 });
    }
  }

  const kind = propertyIds.length === 1 ? "single" : "union";

  // For singles: if a workspace already exists for that property, return it instead of duplicating
  if (kind === "single") {
    const existing = findSingleWorkspaceForProperty({
      user_id: primaryUserId,
      property_id: propertyIds[0],
    });
    if (existing) {
      if (body.activate !== false) {
        session.active_workspace_id = existing.id;
        await session.save();
        bumpWorkspaceUsage(existing.id);
      }
      return NextResponse.json({ workspace: existing, deduped: true });
    }
  } else {
    const existing = findUnionWorkspaceForPropertySet({
      user_id: primaryUserId,
      property_ids: propertyIds,
    });
    if (existing) {
      if (body.activate !== false) {
        session.active_workspace_id = existing.id;
        await session.save();
        bumpWorkspaceUsage(existing.id);
      }
      return NextResponse.json({ workspace: existing, deduped: true });
    }
  }

  const name = (body.name || "").trim() || defaultWorkspaceName(props.map((p) => p.display_name));
  const ws = createWorkspace({
    user_id: primaryUserId,
    name,
    kind,
    property_ids: propertyIds,
  });

  if (body.activate !== false) {
    session.active_workspace_id = ws.id;
    await session.save();
  }

  return NextResponse.json({ workspace: ws, deduped: false });
}

function defaultWorkspaceName(names: string[]): string {
  if (names.length === 0) return "Workspace";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names.length - 1} more`;
}

function safeParseIds(s: string): number[] {
  try {
    const arr = JSON.parse(s) as number[];
    return Array.isArray(arr) ? arr.filter((n) => Number.isFinite(n)) : [];
  } catch {
    return [];
  }
}

void countNewFindingsByAgent;

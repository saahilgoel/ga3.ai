import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { getDb } from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";

export async function GET() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({
      findings: [],
      unread_count: 0,
      unread_by_agent: {},
    });
  }

  const db = getDb();
  const userPlaceholders = userIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM findings
       WHERE workspace_id = ? AND user_id IN (${userPlaceholders})
       ORDER BY created_at DESC
       LIMIT 100`
    )
    .all(ws.id, ...userIds) as Array<{
      id: number;
      user_id: number;
      agent_id: string;
      workspace_id: number;
      title: string;
      body: string;
      severity: string;
      data_json: string | null;
      visualization_json: string | null;
      question: string | null;
      status: string;
      scan_id: string | null;
      source_property_ids: string | null;
      created_at: number;
    }>;

  const unreadByAgent: Record<string, number> = {};
  let unreadCount = 0;
  for (const f of rows) {
    if (f.status === "new") {
      unreadCount++;
      unreadByAgent[f.agent_id] = (unreadByAgent[f.agent_id] ?? 0) + 1;
    }
  }

  return NextResponse.json(
    {
      findings: rows.map((f) => ({
        id: f.id,
        agent_id: f.agent_id,
        title: f.title,
        body: f.body,
        severity: f.severity,
        data: f.data_json ? safeParse(f.data_json) : null,
        visualization: f.visualization_json ? safeParse(f.visualization_json) : null,
        question: f.question,
        status: f.status,
        scan_id: f.scan_id,
        source_property_ids: f.source_property_ids ? safeParse(f.source_property_ids) : null,
        created_at: f.created_at,
      })),
      unread_count: unreadCount,
      unread_by_agent: unreadByAgent,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
      },
    }
  );
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

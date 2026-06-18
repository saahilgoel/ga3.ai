import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, resolveWorkspaceWithTokens } from "@/lib/workspace";
import { getBusinessType } from "@/lib/db";
import {
  buildDashboard,
  computeComparison,
  resolvePreset,
  type ComparePreset,
  type DashboardResponse,
  type RangePreset,
} from "@/lib/dashboard";

import { BoundedCache } from "@/lib/bounded-cache";

const CACHE = new BoundedCache<DashboardResponse>(5 * 60 * 1000, 16);

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ error: "no_active_workspace" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    range?: { start: string; end: string } | null;
    range_preset?: RangePreset;
    compare?: ComparePreset;
    refresh?: boolean;
  };
  const preset: RangePreset = body.range_preset ?? "last_7_days";
  const compareMode: ComparePreset = body.compare ?? "previous_period";
  const range = resolvePreset(preset, body.range ?? undefined);
  const compareRange = computeComparison(range, compareMode);
  const key = `${ws.id}|${preset}|${range.start}|${range.end}|${compareMode}|${compareRange?.start ?? ""}|${compareRange?.end ?? ""}`;
  const cached = body.refresh ? undefined : CACHE.get(key);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  const wt = await resolveWorkspaceWithTokens(ws);
  if (wt.properties.length === 0) {
    return NextResponse.json({ error: "no_properties" }, { status: 400 });
  }

  try {
    const data = await buildDashboard({
      active: wt.properties,
      range,
      compareRange,
      rangePresetLabel: preset,
      businessType: getBusinessType(ws.id)?.business_type ?? undefined,
    });
    CACHE.set(key, data);
    return NextResponse.json({ ...data, cached: false });
  } catch (err) {
    console.error("[dashboard] failed:", err);
    return NextResponse.json(
      { error: "dashboard_failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

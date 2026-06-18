import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace, resolveWorkspaceWithTokens } from "@/lib/workspace";
import { REPORTS_BY_PATH } from "@/lib/reports/registry";
import { runReportDef } from "@/lib/reports/runner";
import {
  resolvePreset,
  type RangePreset,
} from "@/lib/dashboard";

import { BoundedCache } from "@/lib/bounded-cache";

const CACHE = new BoundedCache<unknown>(5 * 60 * 1000, 24);

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
    path?: string;
    range_preset?: RangePreset;
    range?: { start: string; end: string } | null;
    refresh?: boolean;
  };
  if (!body.path) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }
  const def = REPORTS_BY_PATH[body.path];
  if (!def) {
    return NextResponse.json({ error: "unknown_report" }, { status: 404 });
  }
  const preset: RangePreset = body.range_preset ?? "last_7_days";
  const range = resolvePreset(preset, body.range ?? undefined);
  const cacheKey = `${ws.id}|${body.path}|${preset}|${range.start}|${range.end}`;
  const cached = body.refresh ? undefined : CACHE.get(cacheKey);
  if (cached) {
    console.log(`[reports] ws=${ws.id} ${body.path} ${preset} cached`);
    return NextResponse.json({ result: cached, range, cached: true });
  }
  const t0 = Date.now();
  console.log(`[reports] ws=${ws.id} ${body.path} ${preset} START`);
  try {
    const wt = await resolveWorkspaceWithTokens(ws);
    if (wt.properties.length === 0) {
      console.warn(`[reports] ws=${ws.id} ${body.path} no_properties`);
      return NextResponse.json({ error: "no_properties" }, { status: 400 });
    }
    const result = await runReportDef({
      def,
      active: wt.properties,
      range,
      workspaceId: ws.id,
      userId: readPrimaryUserId(session) ?? ws.user_id,
    });
    CACHE.set(cacheKey, result);
    console.log(
      `[reports] ws=${ws.id} ${body.path} ${preset} OK ${((Date.now() - t0) / 1000).toFixed(1)}s rows=${result.rows.length} ts=${result.timeseries?.length ?? 0}`
    );
    return NextResponse.json({ result, range, cached: false });
  } catch (err) {
    console.error(
      `[reports] ws=${ws.id} ${body.path} ${preset} FAIL ${((Date.now() - t0) / 1000).toFixed(1)}s:`,
      (err as Error).message
    );
    return NextResponse.json(
      { error: "report_failed", detail: (err as Error).message },
      { status: 500 }
    );
  }
}

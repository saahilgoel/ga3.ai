import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { getDb, getWorkspaceById } from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { getMoEngageConfig } from "@/lib/sources/moengage/api";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  const primary = readPrimaryUserId(session);
  if (!primary || userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { workspace_id?: number };
  const ws = body.workspace_id
    ? getWorkspaceById(body.workspace_id)
    : resolveActiveWorkspace(session);
  if (!ws || !userIds.includes(ws.user_id)) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }
  const cfg = getMoEngageConfig(primary);
  if (!cfg) {
    return NextResponse.json({ error: "moengage_not_configured" }, { status: 400 });
  }
  let existing: Array<{
    type: string;
    source_id: string;
    display_name: string;
    account_email: string;
  }> = [];
  try {
    existing = ws.connected_sources ? JSON.parse(ws.connected_sources) : [];
  } catch {
    existing = [];
  }
  const key = `moengage:${cfg.appId}`;
  if (!existing.some((s) => `${s.type}:${s.source_id}` === key)) {
    existing.push({
      type: "moengage",
      source_id: cfg.appId,
      display_name: `MoEngage · ${cfg.dataCenter.toUpperCase()}`,
      account_email: "",
    });
  }
  getDb()
    .prepare("UPDATE workspaces SET connected_sources = ? WHERE id = ?")
    .run(JSON.stringify(existing), ws.id);
  return NextResponse.json({
    workspace_id: ws.id,
    connected_sources: existing,
  });
}

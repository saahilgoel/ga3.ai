import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { searchEverything } from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ conversations: [], findings: [], briefs: [] });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  if (!q.trim()) {
    return NextResponse.json({ conversations: [], findings: [], briefs: [] });
  }
  const results = searchEverything({
    user_ids: userIds,
    workspace_id: ws.id,
    q,
    limit: 5,
  });
  return NextResponse.json(results);
}

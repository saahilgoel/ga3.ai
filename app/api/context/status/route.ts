import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  getContextStatus,
  listUserUploads,
  summarizeContextBySource,
} from "@/lib/context/db-helpers";

export async function GET() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ status: null });
  const status = getContextStatus(ws.id);
  const sources = summarizeContextBySource(ws.id);
  const uploads = listUserUploads(ws.id);
  return NextResponse.json({
    workspace_id: ws.id,
    workspace_name: ws.name,
    status,
    sources,
    uploads,
  });
}

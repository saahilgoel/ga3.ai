import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { deleteUserUpload } from "@/lib/context/db-helpers";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  deleteUserUpload({ document_id: id, workspace_id: ws.id });
  return NextResponse.json({ ok: true });
}

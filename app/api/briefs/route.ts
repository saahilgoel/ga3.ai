import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { listBriefsForWorkspace } from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";

export async function GET() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ briefs: [] });
  const briefs = listBriefsForWorkspace({ workspace_id: ws.id, limit: 50 });
  return NextResponse.json({
    briefs: briefs.map((b) => ({
      id: b.id,
      template_id: b.template_id,
      title: b.title,
      status: b.status,
      pinned: b.pinned === 1,
      created_at: b.created_at,
      completed_at: b.completed_at,
    })),
  });
}

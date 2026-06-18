import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { refreshSource } from "@/lib/context/orchestrator";

export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  const body = (await req.json()) as { source_type?: string };
  if (!body.source_type) {
    return NextResponse.json({ error: "missing_source_type" }, { status: 400 });
  }

  refreshSource({ workspace_id: ws.id, source_type: body.source_type }).catch((err) => {
    console.error("[context/refresh] failed:", err);
  });

  return NextResponse.json({ ok: true });
}

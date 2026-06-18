import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { buildWorkspaceContext } from "@/lib/context/orchestrator";
import { upsertContextStatus } from "@/lib/context/db-helpers";

export const maxDuration = 300;

export async function POST() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });

  upsertContextStatus({
    workspace_id: ws.id,
    status: "crawling",
    consent_given_at: Math.floor(Date.now() / 1000),
    current_step: "Starting",
    progress_pct: 1,
  });

  // Fire-and-forget. The client polls /api/context/status.
  buildWorkspaceContext(ws.id).catch((err) => {
    console.error("[context/build] failed:", err);
    upsertContextStatus({
      workspace_id: ws.id,
      status: "failed",
      error_text: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ ok: true, workspace_id: ws.id });
}

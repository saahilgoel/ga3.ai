import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { buildIndustrySignals } from "@/lib/context/industry";

export async function POST() {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });

  // Fire-and-forget — the strip listens for industry.progress events.
  buildIndustrySignals({ workspace_id: ws.id, force: true }).catch((err) => {
    console.warn(
      `[industry] manual refresh failed for ws=${ws.id}:`,
      (err as Error).message
    );
  });

  return NextResponse.json({ ok: true, workspace_id: ws.id });
}

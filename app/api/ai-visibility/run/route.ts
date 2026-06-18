import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  runAiVisibility,
  generateRecommendations,
} from "@/lib/context/ai-visibility";

export const maxDuration = 300;

export async function POST() {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });

  // Fire-and-forget: run prompts, then auto-generate the recommendations card.
  (async () => {
    try {
      await runAiVisibility({ workspace_id: ws.id });
      await generateRecommendations({ workspace_id: ws.id });
    } catch (err) {
      console.warn(`[ai-visibility] full run failed:`, (err as Error).message);
    }
  })();

  return NextResponse.json({ ok: true });
}

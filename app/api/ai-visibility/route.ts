import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  listLatestRuns,
  latestRecommendations,
} from "@/lib/context/ai-visibility";

export async function GET() {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ runs: [] });
  return NextResponse.json(
    {
      workspace_id: ws.id,
      runs: listLatestRuns(ws.id),
      recommendations: latestRecommendations(ws.id),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=120",
      },
    }
  );
}

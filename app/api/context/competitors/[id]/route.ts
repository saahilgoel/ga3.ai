import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  getCompetitor,
  listCompetitorDocs,
} from "@/lib/context/competitors-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  const competitor = getCompetitor(id);
  if (!competitor || competitor.workspace_id !== ws.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const docs = listCompetitorDocs(id);
  // Group by source type for the UI
  const grouped: Record<string, typeof docs> = {};
  for (const d of docs) {
    (grouped[d.source_type] ||= []).push(d);
  }
  return NextResponse.json(
    { competitor, docs, grouped },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
      },
    }
  );
}

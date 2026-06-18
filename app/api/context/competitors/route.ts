import { NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import {
  listCompetitors,
  deleteCompetitor,
} from "@/lib/context/competitors-db";

export async function GET() {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ competitors: [] });
  return NextResponse.json(
    { workspace_id: ws.id, competitors: listCompetitors(ws.id) },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
      },
    }
  );
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (readUserIds(session).length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  if (!body.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const list = listCompetitors(ws.id);
  const owns = list.some((c) => c.id === body.id);
  if (!owns) return NextResponse.json({ error: "not_found" }, { status: 404 });
  deleteCompetitor(body.id);
  return NextResponse.json({ ok: true });
}

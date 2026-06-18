import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { getDb } from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";

export async function GET() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ insights: [] });

  const db = getDb();
  const userPlaceholders = userIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM pinned_insights
       WHERE workspace_id = ? AND user_id IN (${userPlaceholders})
       ORDER BY created_at DESC`
    )
    .all(ws.id, ...userIds) as Array<{
      id: number;
      title: string;
      body: string;
      agent: string;
      data_json: string | null;
      created_at: number;
    }>;

  return NextResponse.json({
    insights: rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      agent: r.agent,
      data: r.data_json ? safeParse(r.data_json) : null,
      created_at: r.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userId = readPrimaryUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ error: "no_active_workspace" }, { status: 400 });
  }
  const body = (await req.json()) as {
    title?: string;
    body?: string;
    agent?: string;
    data?: unknown;
  };
  if (!body.title || !body.body || !body.agent) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const result = getDb()
    .prepare(
      `INSERT INTO pinned_insights (user_id, workspace_id, title, body, agent, data_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      ws.id,
      body.title,
      body.body,
      body.agent,
      body.data ? JSON.stringify(body.data) : null
    );
  return NextResponse.json({ id: result.lastInsertRowid, ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") || "0", 10);
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const userPlaceholders = userIds.map(() => "?").join(",");
  getDb()
    .prepare(`DELETE FROM pinned_insights WHERE id = ? AND user_id IN (${userPlaceholders})`)
    .run(id, ...userIds);
  return NextResponse.json({ ok: true });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

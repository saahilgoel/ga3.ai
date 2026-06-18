import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ documents: [] });

  const url = new URL(req.url);
  const sourceType = url.searchParams.get("source_type");
  const limit = parseInt(url.searchParams.get("limit") || "200", 10);

  const db = getDb();
  let sql = `
    SELECT d.id, d.source_type, d.source_url, d.title, d.fetched_at,
           d.user_uploaded, d.filename, d.metadata_json,
           SUBSTR(d.content, 1, 240) AS preview,
           (SELECT COUNT(*) FROM context_chunks WHERE document_id = d.id) AS chunk_count
    FROM context_documents d
    WHERE d.workspace_id = ?
  `;
  const params: Array<string | number> = [ws.id];
  if (sourceType) {
    sql += " AND d.source_type = ?";
    params.push(sourceType);
  }
  sql += ` ORDER BY d.fetched_at DESC LIMIT ${Math.min(limit, 500)}`;

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    source_type: string;
    source_url: string | null;
    title: string | null;
    fetched_at: number;
    user_uploaded: number;
    filename: string | null;
    metadata_json: string | null;
    preview: string;
    chunk_count: number;
  }>;

  return NextResponse.json({
    documents: rows.map((r) => ({
      id: r.id,
      source_type: r.source_type,
      source_url: r.source_url,
      title: r.title,
      fetched_at: r.fetched_at,
      user_uploaded: r.user_uploaded === 1,
      filename: r.filename,
      metadata: r.metadata_json ? safeParse(r.metadata_json) : null,
      preview: r.preview,
      chunk_count: r.chunk_count,
    })),
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const db = getDb();
  const doc = db
    .prepare("SELECT * FROM context_documents WHERE id = ? AND workspace_id = ?")
    .get(id, ws.id) as
    | {
        id: number;
        source_type: string;
        source_url: string | null;
        title: string | null;
        content: string;
        metadata_json: string | null;
        fetched_at: number;
        user_uploaded: number;
        filename: string | null;
      }
    | undefined;
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const chunks = db
    .prepare(
      "SELECT id, chunk_index, content, token_count FROM context_chunks WHERE document_id = ? ORDER BY chunk_index"
    )
    .all(id) as Array<{ id: number; chunk_index: number; content: string; token_count: number }>;

  return NextResponse.json({
    document: {
      id: doc.id,
      source_type: doc.source_type,
      source_url: doc.source_url,
      title: doc.title,
      content: doc.content,
      metadata: doc.metadata_json
        ? (() => {
            try {
              return JSON.parse(doc.metadata_json);
            } catch {
              return null;
            }
          })()
        : null,
      fetched_at: doc.fetched_at,
      user_uploaded: doc.user_uploaded === 1,
      filename: doc.filename,
    },
    chunks,
  });
}

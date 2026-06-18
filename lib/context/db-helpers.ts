import { getDb } from "@/lib/db";
import { chunkText } from "./chunker";
import { embedDocuments, isEmbeddingAvailable, vectorToBlob } from "./embeddings";

export type ContextStatus =
  | "pending"
  | "crawling"
  | "embedding"
  | "ready"
  | "failed"
  | "declined"
  | "partial";

export type ContextStatusRow = {
  workspace_id: number;
  consent_given_at: number | null;
  status: ContextStatus | string;
  brand_name: string | null;
  brand_aliases: string | null;
  current_step: string | null;
  progress_pct: number;
  last_full_refresh_at: number | null;
  last_news_refresh_at: number | null;
  last_reviews_refresh_at: number | null;
  total_credits_used: number;
  document_count: number;
  chunk_count: number;
  failed_sources: string | null;
  error_text: string | null;
  updated_at: number;
  industry_category: string | null;
  last_industry_refresh_at: number | null;
};

export type ContextDocumentRow = {
  id: number;
  workspace_id: number;
  source_type: string;
  source_url: string | null;
  title: string | null;
  content: string;
  metadata_json: string | null;
  fetched_at: number;
  user_uploaded: number;
  filename: string | null;
};

export function getContextStatus(workspaceId: number): ContextStatusRow | undefined {
  return getDb()
    .prepare("SELECT * FROM context_status WHERE workspace_id = ?")
    .get(workspaceId) as ContextStatusRow | undefined;
}

/**
 * Reset any context build left mid-flight (status crawling/embedding). Such a
 * status only exists if a build was killed by a restart/OOM — a live build is
 * tracked in-memory, not by this row. Without this, a stale "crawling" shows a
 * fake forever-progress bar AND blocks rebuilds. Run once on boot.
 * Returns the number of builds recovered.
 */
export function recoverStaleContextBuilds(): number {
  const res = getDb()
    .prepare(
      `UPDATE context_status
          SET status = 'failed',
              current_step = NULL,
              error_text = 'Build was interrupted by a restart — rebuild to retry.'
        WHERE status IN ('crawling', 'embedding')`
    )
    .run();
  return res.changes as number;
}

export function upsertContextStatus(args: {
  workspace_id: number;
  status?: ContextStatus | string;
  current_step?: string | null;
  progress_pct?: number;
  brand_name?: string | null;
  brand_aliases?: string | null;
  consent_given_at?: number | null;
  failed_sources?: string | null;
  error_text?: string | null;
  industry_category?: string | null;
  last_industry_refresh_at?: number | null;
  add_credits?: number;
  add_documents?: number;
  add_chunks?: number;
  last_full_refresh_at?: number | null;
  last_news_refresh_at?: number | null;
  last_reviews_refresh_at?: number | null;
}): void {
  const db = getDb();
  const existing = getContextStatus(args.workspace_id);
  if (!existing) {
    db.prepare(
      `INSERT INTO context_status (workspace_id, status, current_step, progress_pct,
        brand_name, brand_aliases, consent_given_at, total_credits_used,
        document_count, chunk_count, last_full_refresh_at, last_news_refresh_at,
        last_reviews_refresh_at, failed_sources, error_text, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
    ).run(
      args.workspace_id,
      args.status ?? "pending",
      args.current_step ?? null,
      args.progress_pct ?? 0,
      args.brand_name ?? null,
      args.brand_aliases ?? null,
      args.consent_given_at ?? null,
      args.add_credits ?? 0,
      args.add_documents ?? 0,
      args.add_chunks ?? 0,
      args.last_full_refresh_at ?? null,
      args.last_news_refresh_at ?? null,
      args.last_reviews_refresh_at ?? null,
      args.failed_sources ?? null,
      args.error_text ?? null
    );
    return;
  }
  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  if (args.status !== undefined) {
    sets.push("status = ?");
    params.push(args.status);
  }
  if (args.current_step !== undefined) {
    sets.push("current_step = ?");
    params.push(args.current_step);
  }
  if (args.progress_pct !== undefined) {
    sets.push("progress_pct = ?");
    params.push(args.progress_pct);
  }
  if (args.brand_name !== undefined) {
    sets.push("brand_name = ?");
    params.push(args.brand_name);
  }
  if (args.brand_aliases !== undefined) {
    sets.push("brand_aliases = ?");
    params.push(args.brand_aliases);
  }
  if (args.consent_given_at !== undefined) {
    sets.push("consent_given_at = ?");
    params.push(args.consent_given_at);
  }
  if (args.failed_sources !== undefined) {
    sets.push("failed_sources = ?");
    params.push(args.failed_sources);
  }
  if (args.error_text !== undefined) {
    sets.push("error_text = ?");
    params.push(args.error_text);
  }
  if (args.last_full_refresh_at !== undefined) {
    sets.push("last_full_refresh_at = ?");
    params.push(args.last_full_refresh_at);
  }
  if (args.last_news_refresh_at !== undefined) {
    sets.push("last_news_refresh_at = ?");
    params.push(args.last_news_refresh_at);
  }
  if (args.last_reviews_refresh_at !== undefined) {
    sets.push("last_reviews_refresh_at = ?");
    params.push(args.last_reviews_refresh_at);
  }
  if (args.industry_category !== undefined) {
    sets.push("industry_category = ?");
    params.push(args.industry_category);
  }
  if (args.last_industry_refresh_at !== undefined) {
    sets.push("last_industry_refresh_at = ?");
    params.push(args.last_industry_refresh_at);
  }
  if (typeof args.add_credits === "number") {
    sets.push("total_credits_used = total_credits_used + ?");
    params.push(args.add_credits);
  }
  if (typeof args.add_documents === "number") {
    sets.push("document_count = document_count + ?");
    params.push(args.add_documents);
  }
  if (typeof args.add_chunks === "number") {
    sets.push("chunk_count = chunk_count + ?");
    params.push(args.add_chunks);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = unixepoch()");
  params.push(args.workspace_id);
  db.prepare(`UPDATE context_status SET ${sets.join(", ")} WHERE workspace_id = ?`).run(...params);
}

export function insertContextDocument(args: {
  workspace_id: number;
  source_type: string;
  source_url?: string | null;
  title?: string | null;
  content: string;
  metadata?: unknown;
  user_uploaded?: boolean;
  filename?: string | null;
  competitor_id?: number | null;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO context_documents (workspace_id, source_type, source_url, title,
        content, metadata_json, user_uploaded, filename, competitor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.workspace_id,
      args.source_type,
      args.source_url ?? null,
      args.title ?? null,
      args.content,
      args.metadata ? JSON.stringify(args.metadata) : null,
      args.user_uploaded ? 1 : 0,
      args.filename ?? null,
      args.competitor_id ?? null
    );
  return result.lastInsertRowid as number;
}

export type DocumentSummary = {
  source_type: string;
  count: number;
  chunk_count: number;
  fetched_at: number | null;
  filename?: string | null;
  document_id?: number;
};

export function summarizeContextBySource(workspaceId: number): DocumentSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT d.source_type,
              COUNT(DISTINCT d.id) AS doc_count,
              COUNT(c.id) AS chunk_count,
              MAX(d.fetched_at) AS fetched_at
       FROM context_documents d
       LEFT JOIN context_chunks c ON c.document_id = d.id
       WHERE d.workspace_id = ? AND d.user_uploaded = 0
       GROUP BY d.source_type
       ORDER BY d.source_type`
    )
    .all(workspaceId) as Array<{
      source_type: string;
      doc_count: number;
      chunk_count: number;
      fetched_at: number;
    }>;
  return rows.map((r) => ({
    source_type: r.source_type,
    count: r.doc_count,
    chunk_count: r.chunk_count,
    fetched_at: r.fetched_at,
  }));
}

export function listUserUploads(workspaceId: number): Array<{
  id: number;
  filename: string | null;
  title: string | null;
  fetched_at: number;
  chunk_count: number;
}> {
  return getDb()
    .prepare(
      `SELECT d.id, d.filename, d.title, d.fetched_at,
              (SELECT COUNT(*) FROM context_chunks WHERE document_id = d.id) AS chunk_count
       FROM context_documents d
       WHERE d.workspace_id = ? AND d.user_uploaded = 1
       ORDER BY d.fetched_at DESC`
    )
    .all(workspaceId) as Array<{
      id: number;
      filename: string | null;
      title: string | null;
      fetched_at: number;
      chunk_count: number;
    }>;
}

export function deleteUserUpload(args: { document_id: number; workspace_id: number }): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM context_embeddings WHERE chunk_id IN (SELECT id FROM context_chunks WHERE document_id = ?)"
  )
    .run(args.document_id);
  db.prepare("DELETE FROM context_chunks WHERE document_id = ?").run(args.document_id);
  db.prepare(
    "DELETE FROM context_documents WHERE id = ? AND workspace_id = ? AND user_uploaded = 1"
  ).run(args.document_id, args.workspace_id);
}

export function clearAllContext(workspaceId: number): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM context_embeddings WHERE workspace_id = ?"
  ).run(workspaceId);
  db.prepare("DELETE FROM context_chunks WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM context_documents WHERE workspace_id = ?").run(workspaceId);
  db.prepare(
    `UPDATE context_status SET status = 'declined', current_step = NULL, progress_pct = 0,
      document_count = 0, chunk_count = 0, total_credits_used = 0, failed_sources = NULL,
      error_text = NULL, last_full_refresh_at = NULL, updated_at = unixepoch()
     WHERE workspace_id = ?`
  ).run(workspaceId);
}

export function deleteSourceType(args: {
  workspace_id: number;
  source_type: string;
}): void {
  const db = getDb();
  const docs = db
    .prepare(
      "SELECT id FROM context_documents WHERE workspace_id = ? AND source_type = ? AND user_uploaded = 0"
    )
    .all(args.workspace_id, args.source_type) as Array<{ id: number }>;
  for (const d of docs) {
    db.prepare(
      "DELETE FROM context_embeddings WHERE chunk_id IN (SELECT id FROM context_chunks WHERE document_id = ?)"
    ).run(d.id);
    db.prepare("DELETE FROM context_chunks WHERE document_id = ?").run(d.id);
    db.prepare("DELETE FROM context_documents WHERE id = ?").run(d.id);
  }
}

/** Chunk + embed a document, write into context_chunks + context_embeddings. */
export async function embedAndStoreDocument(args: {
  document_id: number;
  workspace_id: number;
  content: string;
  atomic?: boolean;
}): Promise<number> {
  const chunks = chunkText(args.content, { atomic: args.atomic });
  if (chunks.length === 0) return 0;

  const db = getDb();
  const inserted: Array<{ chunk_id: number; content: string }> = [];
  const insertStmt = db.prepare(
    "INSERT INTO context_chunks (document_id, workspace_id, chunk_index, content, token_count) VALUES (?, ?, ?, ?, ?)"
  );
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const r = insertStmt.run(args.document_id, args.workspace_id, i, c.content, c.token_count);
    inserted.push({ chunk_id: r.lastInsertRowid as number, content: c.content });
  }

  if (isEmbeddingAvailable() && inserted.length > 0) {
    const vecs = await embedDocuments(inserted.map((x) => x.content));
    if (vecs && vecs.length === inserted.length) {
      // vec0 wants BigInt for INTEGER partition-key columns (and rowid).
      const vecStmt = db.prepare(
        "INSERT INTO context_embeddings (rowid, workspace_id, embedding) VALUES (?, ?, ?)"
      );
      for (let i = 0; i < inserted.length; i++) {
        try {
          vecStmt.run(
            BigInt(inserted[i].chunk_id),
            BigInt(args.workspace_id),
            vectorToBlob(vecs[i])
          );
        } catch (err) {
          console.warn("[embed] vec insert failed:", (err as Error).message);
        }
      }
    } else if (!vecs) {
      console.warn(
        `[embed] Voyage returned no vectors for ${inserted.length} chunks — falling back to text search for this content.`
      );
    }
  }
  return inserted.length;
}

/**
 * Re-embed any chunks that don't yet have entries in context_embeddings.
 * Called when a workspace had a partial / broken crawl in an earlier run.
 */
export async function backfillMissingEmbeddings(workspaceId: number): Promise<number> {
  if (!isEmbeddingAvailable()) return 0;
  const db = getDb();
  const orphans = db
    .prepare(
      `SELECT c.id, c.content
       FROM context_chunks c
       LEFT JOIN context_embeddings e ON e.rowid = c.id
       WHERE c.workspace_id = ? AND e.rowid IS NULL`
    )
    .all(workspaceId) as Array<{ id: number; content: string }>;
  if (orphans.length === 0) return 0;
  console.log(`[embed] backfilling ${orphans.length} chunk embeddings for workspace=${workspaceId}`);
  const vecs = await embedDocuments(orphans.map((o) => o.content));
  if (!vecs) return 0;
  const stmt = db.prepare(
    "INSERT INTO context_embeddings (rowid, workspace_id, embedding) VALUES (?, ?, ?)"
  );
  let inserted = 0;
  for (let i = 0; i < orphans.length; i++) {
    try {
      stmt.run(BigInt(orphans[i].id), BigInt(workspaceId), vectorToBlob(vecs[i]));
      inserted++;
    } catch (err) {
      console.warn("[embed] backfill insert failed:", (err as Error).message);
    }
  }
  return inserted;
}

import { getDb } from "@/lib/db";

export type CompetitorRow = {
  id: number;
  workspace_id: number;
  brand_name: string;
  website_url: string | null;
  detection_query: string | null;
  reasoning: string | null;
  status: "pending" | "crawling" | "ready" | "failed" | "partial" | string;
  progress_pct: number;
  current_step: string | null;
  credits_used: number;
  document_count: number;
  chunk_count: number;
  error_text: string | null;
  detected_at: number;
  ingested_at: number | null;
};

export function listCompetitors(workspaceId: number): CompetitorRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM competitors WHERE workspace_id = ? ORDER BY detected_at ASC"
    )
    .all(workspaceId) as CompetitorRow[];
}

export function getCompetitor(id: number): CompetitorRow | undefined {
  return getDb()
    .prepare("SELECT * FROM competitors WHERE id = ?")
    .get(id) as CompetitorRow | undefined;
}

export function getCompetitorByName(args: {
  workspace_id: number;
  brand_name: string;
}): CompetitorRow | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM competitors WHERE workspace_id = ? AND lower(brand_name) = lower(?)"
    )
    .get(args.workspace_id, args.brand_name) as CompetitorRow | undefined;
}

export function insertCompetitor(args: {
  workspace_id: number;
  brand_name: string;
  website_url?: string | null;
  detection_query?: string | null;
  reasoning?: string | null;
}): CompetitorRow {
  const existing = getCompetitorByName({
    workspace_id: args.workspace_id,
    brand_name: args.brand_name,
  });
  if (existing) return existing;
  const r = getDb()
    .prepare(
      `INSERT INTO competitors (workspace_id, brand_name, website_url, detection_query, reasoning, status, progress_pct)
       VALUES (?, ?, ?, ?, ?, 'pending', 0)`
    )
    .run(
      args.workspace_id,
      args.brand_name,
      args.website_url ?? null,
      args.detection_query ?? null,
      args.reasoning ?? null
    );
  return getCompetitor(r.lastInsertRowid as number)!;
}

export function updateCompetitor(args: {
  id: number;
  status?: string;
  progress_pct?: number;
  current_step?: string | null;
  website_url?: string | null;
  add_credits?: number;
  add_documents?: number;
  add_chunks?: number;
  error_text?: string | null;
  ingested_at?: number | null;
}): void {
  const sets: string[] = [];
  const params: Array<string | number | null> = [];
  if (args.status !== undefined) {
    sets.push("status = ?");
    params.push(args.status);
  }
  if (args.progress_pct !== undefined) {
    sets.push("progress_pct = ?");
    params.push(args.progress_pct);
  }
  if (args.current_step !== undefined) {
    sets.push("current_step = ?");
    params.push(args.current_step);
  }
  if (args.website_url !== undefined) {
    sets.push("website_url = ?");
    params.push(args.website_url);
  }
  if (args.add_credits !== undefined) {
    sets.push("credits_used = credits_used + ?");
    params.push(args.add_credits);
  }
  if (args.add_documents !== undefined) {
    sets.push("document_count = document_count + ?");
    params.push(args.add_documents);
  }
  if (args.add_chunks !== undefined) {
    sets.push("chunk_count = chunk_count + ?");
    params.push(args.add_chunks);
  }
  if (args.error_text !== undefined) {
    sets.push("error_text = ?");
    params.push(args.error_text);
  }
  if (args.ingested_at !== undefined) {
    sets.push("ingested_at = ?");
    params.push(args.ingested_at);
  }
  if (sets.length === 0) return;
  params.push(args.id);
  getDb()
    .prepare(`UPDATE competitors SET ${sets.join(", ")} WHERE id = ?`)
    .run(...params);
}

export type CompetitorDocSummary = {
  id: number;
  source_type: string;
  source_url: string | null;
  title: string | null;
  content: string;
  fetched_at: number;
  metadata: unknown;
};

export function listCompetitorDocs(
  competitorId: number
): CompetitorDocSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT id, source_type, source_url, title, content, fetched_at, metadata_json
       FROM context_documents
       WHERE competitor_id = ?
       ORDER BY fetched_at DESC`
    )
    .all(competitorId) as Array<{
      id: number;
      source_type: string;
      source_url: string | null;
      title: string | null;
      content: string;
      fetched_at: number;
      metadata_json: string | null;
    }>;
  return rows.map((r) => ({
    id: r.id,
    source_type: r.source_type,
    source_url: r.source_url,
    title: r.title,
    content: r.content,
    fetched_at: r.fetched_at,
    metadata: r.metadata_json ? safeParse(r.metadata_json) : null,
  }));
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function deleteCompetitor(id: number): void {
  const db = getDb();
  db.prepare(
    "DELETE FROM context_embeddings WHERE rowid IN (SELECT c.id FROM context_chunks c JOIN context_documents d ON d.id = c.document_id WHERE d.competitor_id = ?)"
  ).run(id);
  db.prepare(
    "DELETE FROM context_chunks WHERE document_id IN (SELECT id FROM context_documents WHERE competitor_id = ?)"
  ).run(id);
  db.prepare("DELETE FROM context_documents WHERE competitor_id = ?").run(id);
  db.prepare("DELETE FROM competitors WHERE id = ?").run(id);
}

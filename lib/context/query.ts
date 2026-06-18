import { getDb } from "@/lib/db";
import { embedQuery, isEmbeddingAvailable, vectorToBlob } from "./embeddings";

export type ContextHit = {
  chunk_id: number;
  document_id: number;
  source_type: string;
  source_url: string | null;
  title: string | null;
  content: string;
  metadata: unknown;
  fetched_at: number;
  relevance: number;
  competitor_id: number | null;
};

export async function queryContext(args: {
  workspace_id: number;
  query: string;
  k?: number;
  source_filter?: string[];
  /**
   * If set, only return chunks whose document is tagged for one of these
   * competitor ids. If empty array, only return *own-brand* chunks (where
   * competitor_id IS NULL). If undefined, no competitor filter is applied.
   */
  competitor_ids?: number[];
  /** True ⇒ exclude competitor-tagged docs (only own-brand). */
  own_brand_only?: boolean;
}): Promise<ContextHit[]> {
  const db = getDb();
  const k = Math.max(1, Math.min(args.k ?? 5, 20));
  if (!args.query.trim()) return [];

  // Build the competitor clause (used in both vector + LIKE paths)
  let competitorClause = "";
  const competitorParams: number[] = [];
  if (args.own_brand_only) {
    competitorClause = "AND d.competitor_id IS NULL";
  } else if (args.competitor_ids && args.competitor_ids.length > 0) {
    competitorClause = `AND d.competitor_id IN (${args.competitor_ids
      .map(() => "?")
      .join(",")})`;
    competitorParams.push(...args.competitor_ids);
  }

  // Path A — vector search via sqlite-vec
  if (isEmbeddingAvailable()) {
    const vec = await embedQuery(args.query);
    if (vec) {
      try {
        // Over-fetch on the vec query so we can post-filter by source_type while
        // still returning at least k hits. workspace_id is part of vec0's
        // partition key, so it filters inside the kNN scan.
        const needsPostFilter =
          (args.source_filter && args.source_filter.length > 0) || competitorClause.length > 0;
        const overFetch = needsPostFilter ? k * 4 : k;
        const knnSql = `
          SELECT rowid AS chunk_id, distance
          FROM context_embeddings
          WHERE embedding MATCH ?
            AND k = ?
            AND workspace_id = ?
          ORDER BY distance
        `;
        const knn = db
          .prepare(knnSql)
          .all(vectorToBlob(vec), overFetch, BigInt(args.workspace_id)) as Array<{
            chunk_id: number;
            distance: number;
          }>;
        if (knn.length === 0) return [];

        // Hydrate with content + metadata via a JOIN to context_chunks/documents.
        const placeholders = knn.map(() => "?").join(",");
        const hydrateSql = `
          SELECT c.id AS chunk_id, c.document_id, c.content AS chunk_content,
                 d.source_type, d.source_url, d.title, d.metadata_json, d.fetched_at,
                 d.competitor_id
          FROM context_chunks c
          JOIN context_documents d ON d.id = c.document_id
          WHERE c.id IN (${placeholders})
            ${args.source_filter && args.source_filter.length > 0
              ? `AND d.source_type IN (${args.source_filter.map(() => "?").join(",")})`
              : ""}
            ${competitorClause}
        `;
        const ids = knn.map((r) => r.chunk_id);
        const params: Array<number | string> = [...ids];
        if (args.source_filter && args.source_filter.length > 0) {
          params.push(...args.source_filter);
        }
        params.push(...competitorParams);
        const hydrated = db.prepare(hydrateSql).all(...params) as Array<{
          chunk_id: number;
          document_id: number;
          chunk_content: string;
          source_type: string;
          source_url: string | null;
          title: string | null;
          metadata_json: string | null;
          fetched_at: number;
          competitor_id: number | null;
        }>;

        // Merge distances, sort, take top k
        const byId = new Map(knn.map((r) => [r.chunk_id, r.distance]));
        return hydrated
          .map((h) => ({
            chunk_id: h.chunk_id,
            document_id: h.document_id,
            source_type: h.source_type,
            source_url: h.source_url,
            title: h.title,
            content: h.chunk_content,
            metadata: h.metadata_json ? safeParse(h.metadata_json) : null,
            fetched_at: h.fetched_at,
            relevance: distanceToRelevance(byId.get(h.chunk_id) ?? 2),
            competitor_id: h.competitor_id,
          }))
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, k);
      } catch (err) {
        console.warn("[query_context] vector search failed:", (err as Error).message);
      }
    }
  }

  // Path B — LIKE-based fallback
  const q = `%${args.query.replace(/[%_]/g, "")}%`;
  const sourceClause =
    args.source_filter && args.source_filter.length > 0
      ? `AND d.source_type IN (${args.source_filter.map(() => "?").join(",")})`
      : "";
  const params: Array<string | number> = [args.workspace_id, q];
  if (args.source_filter && args.source_filter.length > 0)
    params.push(...args.source_filter);
  params.push(...competitorParams);
  const rows = db
    .prepare(
      `SELECT c.id AS chunk_id, c.document_id, c.content AS chunk_content,
              d.source_type, d.source_url, d.title, d.metadata_json, d.fetched_at,
              d.competitor_id
       FROM context_chunks c
       JOIN context_documents d ON d.id = c.document_id
       WHERE c.workspace_id = ? AND c.content LIKE ? ${sourceClause} ${competitorClause}
       ORDER BY length(c.content) ASC
       LIMIT ${k}`
    )
    .all(...params) as Array<{
      chunk_id: number;
      document_id: number;
      chunk_content: string;
      source_type: string;
      source_url: string | null;
      title: string | null;
      metadata_json: string | null;
      fetched_at: number;
      competitor_id: number | null;
    }>;
  return rows.map((r) => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    source_type: r.source_type,
    source_url: r.source_url,
    title: r.title,
    content: r.chunk_content,
    metadata: r.metadata_json ? safeParse(r.metadata_json) : null,
    fetched_at: r.fetched_at,
    relevance: 0.5,
    competitor_id: r.competitor_id,
  }));
}

function distanceToRelevance(d: number): number {
  return Math.max(0, Math.min(1, 1 - d / 2));
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// Generates a compact "what we know about this brand" preamble that gets
// injected into every agent system prompt. Cached per workspace per 15 min.

import { queryContext } from "./query";
import { getContextStatus } from "./db-helpers";
import { listCompetitors } from "./competitors-db";

type SummaryEntry = {
  brand: string | null;
  summary: string;
  hasContext: boolean;
  built_at: number;
};

const cache = new Map<number, SummaryEntry>();
const TTL_MS = 15 * 60_000;

export async function getWorkspaceContextSummary(
  workspaceId: number
): Promise<{ summary: string; hasContext: boolean }> {
  const now = Date.now();
  const cached = cache.get(workspaceId);
  if (cached && now - cached.built_at < TTL_MS) {
    return { summary: cached.summary, hasContext: cached.hasContext };
  }

  const status = getContextStatus(workspaceId);
  const brand = status?.brand_name ?? null;
  const hasContext =
    !!status &&
    (status.status === "ready" || status.status === "partial") &&
    (status.chunk_count ?? 0) > 0;

  if (!hasContext) {
    const out = { summary: "", hasContext: false };
    cache.set(workspaceId, { ...out, brand, built_at: now });
    return out;
  }

  // Pull a few representative chunks across source types (own-brand only — we
  // don't want competitor content leaking into the "what does the business do"
  // preamble).
  const [business, perceptions, recent] = await Promise.all([
    queryContext({
      workspace_id: workspaceId,
      query: "what does this company do and who is it for",
      k: 3,
      source_filter: ["website", "linkedin_company", "ai_overview"],
      own_brand_only: true,
    }).catch(() => []),
    queryContext({
      workspace_id: workspaceId,
      query: "customer complaints and praise",
      k: 4,
      source_filter: [
        "review_trustpilot",
        "review_google_maps",
        "review_indeed",
        "twitter_post",
      ],
      own_brand_only: true,
    }).catch(() => []),
    queryContext({
      workspace_id: workspaceId,
      query: "recent announcements changes launches",
      k: 3,
      source_filter: ["news", "linkedin_post"],
      own_brand_only: true,
    }).catch(() => []),
  ]);

  const lines: string[] = [];
  if (brand) lines.push(`Brand: ${brand}`);
  if (business.length > 0) {
    lines.push("\nWhat the business is (from website/LinkedIn/AI overview):");
    for (const h of business.slice(0, 3)) {
      lines.push(`- ${trim(h.content, 280)}`);
    }
  }
  if (perceptions.length > 0) {
    lines.push("\nWhat customers/employees say (from reviews/social):");
    for (const h of perceptions.slice(0, 4)) {
      const src = h.source_type.replace("review_", "");
      lines.push(`- [${src}] ${trim(h.content, 220)}`);
    }
  }
  if (recent.length > 0) {
    lines.push("\nRecent events (news/LinkedIn):");
    for (const h of recent.slice(0, 3)) {
      lines.push(`- ${h.title ?? ""} — ${trim(h.content, 200)}`);
    }
  }

  const competitors = listCompetitors(workspaceId).filter(
    (c) => c.status === "ready" || c.status === "partial"
  );
  if (competitors.length > 0) {
    lines.push(
      `\nKnown competitors (call query_competitors for details on any): ${competitors
        .map((c) => `${c.brand_name} [id=${c.id}]`)
        .join(", ")}`
    );
  }

  if (status?.industry_category) {
    const refreshedAt = status.last_industry_refresh_at
      ? new Date(status.last_industry_refresh_at * 1000).toISOString().slice(0, 10)
      : "never";
    lines.push(
      `\nIndustry category: ${status.industry_category} (call query_industry for category-level news / Reddit signals; last refresh ${refreshedAt}).`
    );
  }

  const summary = lines.join("\n").trim();
  const out = { summary, hasContext: true };
  cache.set(workspaceId, { ...out, brand, built_at: now });
  return out;
}

function trim(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

export function invalidateWorkspaceContextSummary(workspaceId: number): void {
  cache.delete(workspaceId);
}

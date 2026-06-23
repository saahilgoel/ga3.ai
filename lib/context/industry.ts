// Industry signal feed — beyond brand-level intel, watch the merchant's
// *category* for funding events, regulatory changes, competitor launches,
// emerging trends. Runs automatically after the own-brand build and on a
// daily refresh schedule.
//
// Cost discipline: per refresh we hit Google News + Reddit (via SERP) + a
// broad news search → ~3-5 ScrapingDog credits. Items already stored are
// skipped (URL-level dedup). Top items are LLM-summarised into a single
// "Industry signals" finding so the dashboard pings, not floods.

import { trackedModel } from "@/lib/usage/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import crypto from "node:crypto";
import { getWorkspaceById, insertFinding, getDb } from "@/lib/db";
import { workspaceProperties, parseWorkspacePropertyIds } from "@/lib/workspace";
import { propertySignature } from "@/lib/property-signature";
import { publish } from "@/lib/pubsub";
import * as sd from "./scrapingdog";
import {
  embedAndStoreDocument,
  getContextStatus,
  insertContextDocument,
  upsertContextStatus,
} from "./db-helpers";
import { queryContext } from "./query";
import type { SiteProfile } from "@/lib/profile";

const REFRESH_INTERVAL_MS = 24 * 60 * 60_000;

const CategorySchema = z.object({
  category: z
    .string()
    .min(3)
    .max(80)
    .describe(
      "Short, search-friendly category phrase that captures what this business sells and the market it competes in. Include geography. Example: 'D2C hair care India', 'B2B SaaS payroll US', 'fintech credit cards India'."
    ),
  search_seeds: z
    .array(z.string().min(3).max(60))
    .min(2)
    .max(4)
    .describe(
      "2-4 alternative search queries to use for industry news/discussions about this category. Examples: 'Indian D2C beauty market', 'hair care funding rounds', 'BIS labelling rules'."
    ),
});

type IndustrySignalItem = {
  source_type: "industry_news" | "industry_reddit";
  url: string;
  title: string;
  snippet: string;
  source?: string;
  date?: string;
};

function publishIndustryProgress(args: {
  user_id: number;
  workspace_id: number;
  step: string;
  pct: number;
  status: string;
}): void {
  try {
    publish(args.user_id, {
      kind: "industry.progress",
      workspace_id: args.workspace_id,
      step: args.step,
      pct: args.pct,
      status: args.status,
    });
  } catch {
    // best-effort
  }
}

async function detectIndustryCategory(args: {
  workspace_id: number;
  brand_name: string;
  property_business_blurbs: string[];
}): Promise<{ category: string; seeds: string[] } | null> {
  const blurb = args.property_business_blurbs.filter(Boolean).join("\n\n");
  if (!blurb.trim()) return null;
  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: CategorySchema,
      prompt: `Given this business description for "${args.brand_name}", classify the industry/category in a way that's useful for finding market news and discussions. Be specific (D2C hair care, not just "beauty"). Include geography when relevant.

Description:
${blurb.slice(0, 3000)}

Return:
- category: short, search-friendly phrase (max 80 chars)
- search_seeds: 2-4 alternative queries to use for news/Reddit searches about this category`,
    });
    return { category: object.category, seeds: object.search_seeds };
  } catch (err) {
    console.warn(
      `[industry] category detection failed for ws=${args.workspace_id}:`,
      (err as Error).message
    );
    return null;
  }
}

async function getKnownSignalUrls(workspaceId: number): Promise<Set<string>> {
  const rows = getDb()
    .prepare(
      `SELECT source_url FROM context_documents
       WHERE workspace_id = ? AND source_type IN ('industry_news', 'industry_reddit')`
    )
    .all(workspaceId) as Array<{ source_url: string | null }>;
  return new Set(rows.map((r) => r.source_url).filter((u): u is string => !!u));
}

async function fetchSignals(args: {
  category: string;
  seeds: string[];
  brand_name: string;
}): Promise<{ items: IndustrySignalItem[]; credits: number }> {
  const items: IndustrySignalItem[] = [];
  let credits = 0;

  // 1) Google News for the primary category
  const news = await sd.googleNews(args.category, { country: "in" });
  credits += news.credits;
  for (const n of news.results.slice(0, 25)) {
    items.push({
      source_type: "industry_news",
      url: n.url,
      title: n.title,
      snippet: n.snippet,
      source: n.source,
      date: n.date,
    });
  }

  // 2) Reddit discussions via SERP for the first 2 seeds (skip own-brand
  // category-overlap — drop hits that look like brand-only news).
  for (const seed of args.seeds.slice(0, 2)) {
    const r = await sd.googleSearch(`site:reddit.com ${seed}`, {
      country: "in",
      results: 15,
    });
    credits += r.credits;
    for (const hit of r.results) {
      if (!hit.url.includes("reddit.com/")) continue;
      items.push({
        source_type: "industry_reddit",
        url: hit.url,
        title: hit.title,
        snippet: hit.snippet,
      });
    }
  }

  // 3) One extra Google News query on the first seed for breadth
  if (args.seeds[0]) {
    const extra = await sd.googleNews(args.seeds[0], { country: "in" });
    credits += extra.credits;
    for (const n of extra.results.slice(0, 15)) {
      items.push({
        source_type: "industry_news",
        url: n.url,
        title: n.title,
        snippet: n.snippet,
        source: n.source,
        date: n.date,
      });
    }
  }

  // Deduplicate by URL within this batch
  const seen = new Set<string>();
  const unique: IndustrySignalItem[] = [];
  const brandLower = args.brand_name.toLowerCase();
  for (const it of items) {
    if (!it.url || seen.has(it.url)) continue;
    seen.add(it.url);
    // Drop items that are obviously about the user's own brand
    if (
      it.title.toLowerCase().includes(brandLower) &&
      it.snippet.toLowerCase().includes(brandLower)
    ) {
      continue;
    }
    unique.push(it);
  }
  return { items: unique, credits };
}

// Schema is loose on purpose — Haiku tends to violate strict bounds on
// generateObject, which we saw kill the whole step. We re-trim in code below.
const DigestSchema = z.object({
  headline: z
    .string()
    .describe("Punchy 1-line headline (≤90 chars) summarising the most important industry shifts."),
  body: z
    .string()
    .describe(
      "2-4 sentences. Tie 2-3 specific items together with the merchant's category. Cite source names inline. Plain text. NO emojis."
    ),
  severity: z.enum(["high", "medium", "low"]),
  question: z
    .string()
    .nullable()
    .describe("Optional 1-line follow-up question for the merchant, or null."),
});

async function digestSignals(args: {
  category: string;
  brand_name: string;
  items: IndustrySignalItem[];
}): Promise<z.infer<typeof DigestSchema> | null> {
  if (args.items.length === 0) return null;
  const block = args.items
    .slice(0, 18)
    .map(
      (it, i) =>
        `[${i + 1}] (${it.source_type === "industry_reddit" ? "Reddit" : it.source || "news"}${it.date ? " · " + it.date : ""}) ${it.title}\n    ${it.snippet}\n    ${it.url}`
    )
    .join("\n\n");
  const prompt = `You are summarising fresh industry signals for "${args.brand_name}" (category: ${args.category}). You're filing a brief for the founder/marketing head, so be concrete.

Pick the 2-3 most consequential items from below — funding/M&A, new launches, regulatory news, pricing wars, search-trend shifts — and write a tight digest. Skip listicles, ad blogs, and pure brand-only news about ${args.brand_name}. Plain text. No emojis.

Signals:
${block}`;
  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: DigestSchema,
      prompt,
    });
    return {
      headline: object.headline.slice(0, 120).trim(),
      body: object.body.slice(0, 1200).trim(),
      severity: object.severity,
      question: object.question ? object.question.slice(0, 160).trim() : null,
    };
  } catch (err) {
    console.warn(
      "[industry] digest generateObject failed, falling back to text:",
      (err as Error).message
    );
    // Fallback: ask for plain text and parse ourselves so a bad schema doesn't
    // kill the finding entirely.
    try {
      const { generateText } = await import("ai");
      const { text } = await generateText({
        model: trackedModel("claude-haiku-4-5-20251001"),
        prompt: `${prompt}\n\nRespond with exactly four lines:\nLINE 1: <headline up to 90 chars>\nLINE 2: <2-3 sentence body>\nLINE 3: <severity: high|medium|low>\nLINE 4: <one-line follow-up question or "none">`,
      });
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length < 3) return null;
      const headline = lines[0].replace(/^LINE\s*1:\s*/i, "").slice(0, 120);
      const body = lines[1].replace(/^LINE\s*2:\s*/i, "").slice(0, 1200);
      const sevRaw = (lines[2] || "")
        .replace(/^LINE\s*3:\s*/i, "")
        .toLowerCase();
      const severity: "high" | "medium" | "low" =
        sevRaw.includes("high") ? "high" : sevRaw.includes("low") ? "low" : "medium";
      const qRaw = (lines[3] || "").replace(/^LINE\s*4:\s*/i, "").trim();
      const question =
        qRaw && !/^none$/i.test(qRaw) ? qRaw.slice(0, 160) : null;
      return { headline, body, severity, question };
    } catch (e2) {
      console.warn("[industry] digest fallback also failed:", (e2 as Error).message);
      return null;
    }
  }
}

export async function buildIndustrySignals(args: {
  workspace_id: number;
  force?: boolean;
}): Promise<void> {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return;
  const status = getContextStatus(args.workspace_id);
  const brandName = status?.brand_name;
  if (!brandName) {
    console.log(
      `[industry] ws=${args.workspace_id} skipped — own brand not yet detected`
    );
    return;
  }
  if (
    !args.force &&
    status?.last_industry_refresh_at &&
    Date.now() - status.last_industry_refresh_at * 1000 < REFRESH_INTERVAL_MS
  ) {
    return; // recently refreshed
  }

  const t0 = Date.now();
  let creditsUsed = 0;
  let docsAdded = 0;

  // ─── Step 1: ensure we have a category ───
  publishIndustryProgress({
    user_id: ws.user_id,
    workspace_id: args.workspace_id,
    step: "Identifying market",
    pct: 10,
    status: "running",
  });

  let category = status?.industry_category;
  let seeds: string[] = [];

  if (!category) {
    const props = workspaceProperties(ws);
    const blurbs: string[] = [];
    for (const p of props) {
      if (p.site_profile_json) {
        try {
          const profile = JSON.parse(p.site_profile_json) as SiteProfile;
          if (profile.business) blurbs.push(`${p.display_name}: ${profile.business}`);
          if (profile.audience) blurbs.push(`Audience: ${profile.audience}`);
        } catch {
          // skip
        }
      }
    }
    const detected = await detectIndustryCategory({
      workspace_id: args.workspace_id,
      brand_name: brandName,
      property_business_blurbs: blurbs,
    });
    if (detected) {
      category = detected.category;
      seeds = detected.seeds;
      upsertContextStatus({
        workspace_id: args.workspace_id,
        industry_category: category,
      });
      console.log(
        `[industry] ws=${args.workspace_id} category="${category}" seeds=[${seeds.join(", ")}]`
      );
    }
  }

  if (!category) {
    console.log(
      `[industry] ws=${args.workspace_id} aborted — could not determine category`
    );
    return;
  }

  // Re-derive seeds on cached-category path (cheap; just brand-and-category variants)
  if (seeds.length === 0) {
    seeds = [`${category} India`, `${category} news`, `${category} trends`];
  }

  // ─── Step 2: fetch signals ───
  publishIndustryProgress({
    user_id: ws.user_id,
    workspace_id: args.workspace_id,
    step: "Scanning category news",
    pct: 35,
    status: "running",
  });
  const { items, credits } = await fetchSignals({
    category,
    seeds,
    brand_name: brandName,
  });
  creditsUsed += credits;

  // ─── Step 3: novelty filter — drop items we already have ───
  const known = await getKnownSignalUrls(args.workspace_id);
  const fresh = items.filter((it) => !known.has(it.url));
  if (fresh.length === 0) {
    publishIndustryProgress({
      user_id: ws.user_id,
      workspace_id: args.workspace_id,
      step: "No new signals",
      pct: 100,
      status: "idle",
    });
    upsertContextStatus({
      workspace_id: args.workspace_id,
      last_industry_refresh_at: Math.floor(Date.now() / 1000),
      add_credits: creditsUsed,
    });
    console.log(
      `[industry] ws=${args.workspace_id} no new signals (${items.length} known, ${credits} credits)`
    );
    return;
  }

  // ─── Step 4: store fresh items as embedded docs (so RAG covers them) ───
  publishIndustryProgress({
    user_id: ws.user_id,
    workspace_id: args.workspace_id,
    step: `Storing ${fresh.length} signals`,
    pct: 60,
    status: "running",
  });
  let chunksAdded = 0;
  for (const it of fresh.slice(0, 30)) {
    try {
      const content = `${it.title}\n${it.snippet}\nsource: ${it.source ?? "(reddit/web)"} · ${it.date ?? ""}\n${it.url}`;
      const doc_id = insertContextDocument({
        workspace_id: args.workspace_id,
        source_type: it.source_type,
        source_url: it.url,
        title: it.title,
        content,
        metadata: {
          source: it.source,
          date: it.date,
          category,
        },
      });
      const chunks = await embedAndStoreDocument({
        document_id: doc_id,
        workspace_id: args.workspace_id,
        content,
        atomic: true,
      });
      docsAdded += 1;
      chunksAdded += chunks;
    } catch (err) {
      console.warn(`[industry] doc insert failed:`, (err as Error).message);
    }
  }
  upsertContextStatus({
    workspace_id: args.workspace_id,
    add_documents: docsAdded,
    add_chunks: chunksAdded,
  });

  // ─── Step 5: digest into a single finding ───
  publishIndustryProgress({
    user_id: ws.user_id,
    workspace_id: args.workspace_id,
    step: "Summarising",
    pct: 85,
    status: "running",
  });
  const digest = await digestSignals({
    category,
    brand_name: brandName,
    items: fresh,
  });
  if (digest) {
    try {
      const propertyIds = parseWorkspacePropertyIds(ws);
      const sig = propertySignature(propertyIds);
      const scan_id = `industry-${crypto.randomUUID()}`;
      // Supersede prior-run industry signals (older than this run) so the
      // newsroom shows the latest market read, not every day's. Findings just
      // inserted in this run are <1h old and untouched; pins are kept.
      try {
        getDb()
          .prepare(
            `UPDATE findings SET status = 'archived'
             WHERE user_id = ? AND property_signature = ?
               AND status NOT IN ('archived', 'pinned')
               AND scan_id LIKE 'industry-%'
               AND created_at < unixepoch() - 3600`
          )
          .run(ws.user_id, sig);
      } catch {
        // best-effort
      }
      const inserted = insertFinding({
        user_id: ws.user_id,
        agent_id: "raavi",
        property_signature: sig,
        title: digest.headline,
        body: digest.body,
        severity: digest.severity,
        data_json: JSON.stringify({
          category,
          item_count: fresh.length,
          top_items: fresh.slice(0, 5).map((it) => ({
            title: it.title,
            url: it.url,
            source: it.source,
            date: it.date,
          })),
        }),
        visualization_json: null,
        question: digest.question,
        scan_id,
      });
      // Tag with workspace_id (the insert doesn't take it)
      getDb()
        .prepare("UPDATE findings SET workspace_id = ? WHERE id = ?")
        .run(ws.id, inserted.id);
      try {
        publish(ws.user_id, {
          kind: "finding.new",
          workspace_id: ws.id,
          finding_id: inserted.id,
          agent_id: inserted.agent_id,
        });
      } catch {
        // pubsub is best-effort
      }
    } catch (err) {
      console.warn("[industry] finding insert failed:", (err as Error).message);
    }
  }

  upsertContextStatus({
    workspace_id: args.workspace_id,
    last_industry_refresh_at: Math.floor(Date.now() / 1000),
    add_credits: creditsUsed,
  });
  publishIndustryProgress({
    user_id: ws.user_id,
    workspace_id: args.workspace_id,
    step: digest ? digest.headline : `${fresh.length} new signals`,
    pct: 100,
    status: "ready",
  });
  console.log(
    `[industry] ws=${args.workspace_id} done in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${fresh.length} new · ${creditsUsed} credits · digest=${!!digest}`
  );
}

/** Used by the agent tool to surface industry context in chat. */
export async function queryIndustryContext(args: {
  workspace_id: number;
  query: string;
  k?: number;
}) {
  return queryContext({
    workspace_id: args.workspace_id,
    query: args.query,
    k: args.k ?? 6,
    source_filter: ["industry_news", "industry_reddit"],
  });
}

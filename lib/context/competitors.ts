// Competitor intelligence — given a brand, detect 2-3 direct competitors and
// run a *light* context build for each (homepage + about/pricing + brand SERP
// summary + recent news). Stays under ~30 credits total so it can run
// automatically after the main brand build without blowing the workspace
// budget.
//
// Documents are stored in the existing context_documents table with
// `competitor_id` set, so retrieval continues to use one embedding index per
// workspace; the agent tool filters by competitor on retrieval.

import { trackedModel } from "@/lib/usage/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getWorkspaceById } from "@/lib/db";
import { workspaceProperties } from "@/lib/workspace";
import { publish } from "@/lib/pubsub";
import * as sd from "./scrapingdog";
import {
  embedAndStoreDocument,
  getContextStatus,
  insertContextDocument,
} from "./db-helpers";
import {
  insertCompetitor,
  listCompetitors,
  updateCompetitor,
  type CompetitorRow,
} from "./competitors-db";

const CREDIT_BUDGET_PER_COMPETITOR = 12;
const MAX_COMPETITORS = 3;

const DiscoverySchema = z.object({
  competitors: z
    .array(
      z.object({
        brand_name: z
          .string()
          .min(2)
          .describe("Distinct competitor brand name. Not the user's own brand. Not a generic descriptor."),
        website_url: z
          .string()
          .nullable()
          .describe("Best-guess primary website URL. null if unknown."),
        reasoning: z
          .string()
          .describe("One short line: why this is a real competitor (mentioned alongside the brand, same category, etc)."),
      })
    )
    .max(MAX_COMPETITORS),
});

type DetectedCompetitor = z.infer<typeof DiscoverySchema>["competitors"][number];

function publishCompetitorProgress(args: {
  userId: number;
  workspace_id: number;
  competitor_id: number;
  brand_name: string;
  step: string;
  pct: number;
  status: string;
}): void {
  try {
    publish(args.userId, {
      kind: "competitor.progress",
      workspace_id: args.workspace_id,
      competitor_id: args.competitor_id,
      brand_name: args.brand_name,
      step: args.step,
      pct: args.pct,
      status: args.status,
    });
  } catch {
    // best-effort
  }
}

function stripHtml(html: string): { text: string; title: string | null } {
  if (!html) return { text: "", title: null };
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? null;
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { text: cleaned, title };
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function discoverCompetitors(args: {
  brand_name: string;
  website_url: string;
  category_hint?: string | null;
  business_desc?: string | null;
}): Promise<{ competitors: DetectedCompetitor[]; credits: number }> {
  const ownHost = hostOf(args.website_url);
  // Drop parent-company qualifiers that drag the SERP into the wrong industry
  // ("Acme Pay by Acme" → "Acme Pay"), so we don't pull the parent's competitors.
  const searchBrand =
    args.brand_name.split(/\s+(?:by|from|powered by|, an? )\s+/i)[0].trim() ||
    args.brand_name;
  const cat = args.category_hint?.trim();
  // When we know the category, anchor on it — the brand name alone (especially
  // with a parent qualifier) sends Google toward the wrong market.
  const queries = cat
    ? [`best ${cat} in India`, `top ${cat} apps in India`, `${searchBrand} competitors`]
    : [`alternatives to ${searchBrand}`, `${searchBrand} vs`, `${searchBrand} competitors`];
  let credits = 0;
  const snippets: string[] = [];
  for (const q of queries) {
    const r = await sd.googleSearch(q, { country: "in", results: 15 });
    credits += r.credits;
    for (const o of r.results) {
      const host = hostOf(o.url);
      if (!host) continue;
      if (ownHost && host.endsWith(ownHost)) continue;
      // Skip noisy aggregators that hijack "alternatives to X" SERPs.
      if (/wikipedia\.org|youtube\.com|reddit\.com|quora\.com|facebook\.com|twitter\.com|x\.com|linkedin\.com|pinterest\.com|medium\.com|substack\.com|news\.ycombinator/i.test(host)) {
        continue;
      }
      snippets.push(
        `[${o.position}] ${o.title}\n  url: ${o.url}\n  ${o.snippet}`
      );
    }
  }
  if (snippets.length === 0) return { competitors: [], credits };

  // Ask Claude Haiku to extract 3 distinct competitor brand names from these
  // SERP snippets. We pass the user's own brand so it doesn't accidentally
  // re-detect itself, and ask for a website + reasoning per pick.
  let detected: DetectedCompetitor[] = [];
  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: DiscoverySchema,
      prompt: `"${args.brand_name}" is ${cat ? `a ${cat}` : "a business"} in India${args.business_desc ? `.\nAbout it: ${args.business_desc}` : ""}.
Own website: ${args.website_url}.

From the Google results below, pick up to ${MAX_COMPETITORS} DISTINCT, REAL competitor brands that operate in the SAME category — companies a customer would choose INSTEAD of "${args.brand_name}".

CRITICAL — only pick true category competitors. Do NOT pick:
- companies from a DIFFERENT industry — especially a parent company, or the logistics / shipping / payment / SaaS vendors this brand merely uses or is built on
- "${args.brand_name}" itself
- generic listicles ("Top 10…", "Best of 2025"), Wikipedia, Reddit, YouTube, news outlets, blog aggregators
- pure marketplaces (Amazon, Flipkart) unless one is a genuine direct competitor

For each competitor, give its real brand name, its primary website URL (best guess from the SERP), and a one-line reason it competes in the same category.

Google results:
${snippets.slice(0, 60).join("\n\n")}`,
    });
    detected = object.competitors;
  } catch (err) {
    console.warn("[competitors] discovery LLM call failed:", (err as Error).message);
  }

  // Final filter: dedupe by lowercase name, drop anything matching own host.
  const seen = new Set<string>();
  const out: DetectedCompetitor[] = [];
  for (const c of detected) {
    const norm = c.brand_name.trim().toLowerCase();
    if (!norm || seen.has(norm)) continue;
    if (ownHost && c.website_url && hostOf(c.website_url) === ownHost) continue;
    seen.add(norm);
    out.push(c);
    if (out.length >= MAX_COMPETITORS) break;
  }
  return { competitors: out, credits };
}

async function ingestCompetitor(args: {
  workspace_id: number;
  user_id: number;
  competitor: CompetitorRow;
}): Promise<void> {
  const { workspace_id, user_id, competitor } = args;
  let creditsUsed = 0;
  let docCount = 0;
  let chunkCount = 0;

  function step(stepName: string, pct: number) {
    updateCompetitor({
      id: competitor.id,
      status: "crawling",
      progress_pct: pct,
      current_step: stepName,
    });
    publishCompetitorProgress({
      userId: user_id,
      workspace_id,
      competitor_id: competitor.id,
      brand_name: competitor.brand_name,
      step: stepName,
      pct,
      status: "crawling",
    });
  }

  async function storeDoc(sourceType: string, args2: {
    source_url?: string | null;
    title?: string | null;
    content: string;
    metadata?: unknown;
  }): Promise<void> {
    if (args2.content.trim().length < 100) return;
    const doc_id = insertContextDocument({
      workspace_id,
      source_type: sourceType,
      source_url: args2.source_url ?? null,
      title: args2.title ?? null,
      content: args2.content,
      metadata: args2.metadata,
      competitor_id: competitor.id,
    });
    const chunks = await embedAndStoreDocument({
      document_id: doc_id,
      workspace_id,
      content: args2.content,
    });
    docCount += 1;
    chunkCount += chunks;
  }

  try {
    // ─── Step 1: homepage scrape (and confirm/learn website_url) ───
    step("Scanning homepage", 15);
    let websiteUrl = competitor.website_url;
    if (!websiteUrl) {
      // Use a SERP probe to find the homepage
      const sr = await sd.googleSearch(competitor.brand_name, {
        country: "in",
        results: 5,
      });
      creditsUsed += sr.credits;
      const ownHost = hostOf(sr.results[0]?.url);
      if (ownHost) {
        websiteUrl = `https://${ownHost}`;
        updateCompetitor({ id: competitor.id, website_url: websiteUrl });
      }
    }

    if (websiteUrl && creditsUsed < CREDIT_BUDGET_PER_COMPETITOR) {
      const home = await sd.scrape(websiteUrl, { dynamic: false });
      creditsUsed += home.credits;
      if (home.html) {
        const { text, title } = stripHtml(home.html);
        if (text.length > 200) {
          await storeDoc("competitor_website", {
            source_url: websiteUrl,
            title: title ?? `${competitor.brand_name} — homepage`,
            content: text.slice(0, 10000),
          });
        }
      }
    }

    // ─── Step 2: about + pricing (best-effort) ───
    if (websiteUrl && creditsUsed < CREDIT_BUDGET_PER_COMPETITOR) {
      step("About + pricing pages", 40);
      const base = new URL(websiteUrl);
      const extras = [`${base.origin}/about`, `${base.origin}/pricing`];
      for (const url of extras) {
        if (creditsUsed >= CREDIT_BUDGET_PER_COMPETITOR) break;
        const r = await sd.scrape(url, { dynamic: false });
        creditsUsed += r.credits;
        if (!r.html) continue;
        const { text, title } = stripHtml(r.html);
        if (text.length < 200) continue;
        await storeDoc("competitor_website", {
          source_url: url,
          title: title ?? `${competitor.brand_name} — ${url.split("/").pop()}`,
          content: text.slice(0, 8000),
        });
      }
    }

    // ─── Step 3: brand SERP summary ───
    if (creditsUsed < CREDIT_BUDGET_PER_COMPETITOR) {
      step("Search results", 65);
      const sr = await sd.googleSearch(competitor.brand_name, {
        country: "in",
        results: 15,
      });
      creditsUsed += sr.credits;
      if (sr.results.length > 0) {
        const summary = sr.results
          .slice(0, 15)
          .map((r) => `${r.position}. ${r.title}\n${r.snippet}\n${r.url}`)
          .join("\n\n");
        await storeDoc("competitor_serp", {
          source_url: `google_search:${competitor.brand_name}`,
          title: `${competitor.brand_name} — SERP snapshot`,
          content: summary,
        });
      }
    }

    // ─── Step 3a: LinkedIn jobs (hiring signal) — 5 credits, structured data. ───
    if (creditsUsed < CREDIT_BUDGET_PER_COMPETITOR + 5) {
      try {
        const lj = await sd.linkedinJobs({
          keyword: competitor.brand_name,
          geoid: "102713980", // India
          limit: 25,
        });
        creditsUsed += lj.credits;
        const matching = lj.jobs.filter((j) =>
          j.company.toLowerCase().includes(competitor.brand_name.toLowerCase())
        );
        if (matching.length > 0) {
          const compiled = matching
            .map(
              (j) =>
                `${j.title} — ${j.location} · ${j.posted_at}\n  ${j.url}`
            )
            .join("\n\n");
          await storeDoc("competitor_jobs", {
            source_url: `linkedin_jobs:${competitor.brand_name}`,
            title: `${competitor.brand_name} — open roles (${matching.length})`,
            content: compiled,
            metadata: { jobs: matching, total: matching.length },
          });
        }
      } catch (err) {
        console.warn(
          `[competitors] linkedinJobs for ${competitor.brand_name} failed:`,
          (err as Error).message
        );
      }
    }

    // ─── Step 3b: Shopify catalog if their site is Shopify (free, direct fetch). ───
    if (websiteUrl) {
      try {
        const { ingestShopifyCatalog } = await import("./catalog-shopify");
        const res = await ingestShopifyCatalog({
          workspace_id,
          website_url: websiteUrl,
          competitor_id: competitor.id,
        });
        if (res.is_shopify && res.docs_inserted > 0) {
          docCount += res.docs_inserted;
          chunkCount += res.chunks_inserted;
        }
      } catch (err) {
        console.warn(
          `[competitors] shopify catalog for ${competitor.brand_name} failed:`,
          (err as Error).message
        );
      }
    }

    // ─── Step 4: recent news headlines (no full-article fetch — save credits) ───
    if (creditsUsed < CREDIT_BUDGET_PER_COMPETITOR) {
      step("News headlines", 85);
      const news = await sd.googleNews(competitor.brand_name, { country: "in" });
      creditsUsed += news.credits;
      const top = news.results.slice(0, 20);
      if (top.length > 0) {
        const compiled = top
          .map(
            (n) =>
              `• ${n.title}\n  ${n.snippet}\n  source: ${n.source} · ${n.date}\n  ${n.url}`
          )
          .join("\n\n");
        await storeDoc("competitor_news", {
          source_url: `google_news:${competitor.brand_name}`,
          title: `${competitor.brand_name} — news (recent)`,
          content: compiled,
        });
      }
    }

    updateCompetitor({
      id: competitor.id,
      status: "ready",
      progress_pct: 100,
      current_step: null,
      add_credits: creditsUsed,
      add_documents: docCount,
      add_chunks: chunkCount,
      ingested_at: Math.floor(Date.now() / 1000),
    });
    publishCompetitorProgress({
      userId: user_id,
      workspace_id,
      competitor_id: competitor.id,
      brand_name: competitor.brand_name,
      step: "Ready",
      pct: 100,
      status: "ready",
    });

    // Fire-and-forget ad library scrape — Meta Ad Library + Google Ads
    // Transparency Report — for this competitor. Independent of main ingest
    // so a slow or failing ad scrape doesn't block other competitors.
    import("./ad-library")
      .then(({ buildCompetitorAds }) =>
        buildCompetitorAds({
          workspace_id,
          competitor_id: competitor.id,
        })
      )
      .catch((err) =>
        console.warn(
          `[competitors] ad library kickoff for ${competitor.brand_name} failed:`,
          (err as Error).message
        )
      );
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(
      `[competitors] ingest "${competitor.brand_name}" failed:`,
      msg
    );
    updateCompetitor({
      id: competitor.id,
      status: "failed",
      current_step: null,
      error_text: msg,
      add_credits: creditsUsed,
      add_documents: docCount,
      add_chunks: chunkCount,
    });
    publishCompetitorProgress({
      userId: user_id,
      workspace_id,
      competitor_id: competitor.id,
      brand_name: competitor.brand_name,
      step: "Failed",
      pct: 100,
      status: "failed",
    });
  }
}

export async function buildCompetitorContext(args: {
  workspace_id: number;
  category_hint?: string | null;
}): Promise<void> {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return;
  const status = getContextStatus(args.workspace_id);
  if (!status?.brand_name) {
    console.log(
      `[competitors] workspace=${args.workspace_id} skipped — own brand not yet detected`
    );
    return;
  }
  const props = workspaceProperties(ws);
  const websiteUrl = props.find((p) => p.website_url)?.website_url;
  if (!websiteUrl) return;

  const existing = listCompetitors(args.workspace_id);
  if (existing.length >= MAX_COMPETITORS) {
    console.log(
      `[competitors] workspace=${args.workspace_id} already has ${existing.length} competitors, skipping discovery`
    );
    return;
  }

  console.log(
    `[competitors] workspace=${args.workspace_id} discovering — brand="${status.brand_name}"`
  );
  const t0 = Date.now();

  // Anchor discovery on the homepage-derived category + business (what THIS
  // site actually does) rather than the brand name, which may carry a parent
  // company that drags the SERP into the wrong industry.
  let categoryHint: string | null = args.category_hint ?? null;
  let businessDesc: string | null = null;
  try {
    const raw = props.find((p) => p.site_profile_json)?.site_profile_json;
    if (raw) {
      const prof = JSON.parse(raw) as { category?: string; business?: string };
      if (prof.category && prof.category.trim()) categoryHint = prof.category.trim();
      if (prof.business) businessDesc = prof.business;
    }
  } catch {
    /* best-effort; fall back to brand-only discovery */
  }

  // No category yet (older/stale profile, or a competitor-only re-study without
  // a full rebuild)? Derive one now so discovery stays category-anchored.
  if (!categoryHint) {
    try {
      const { generateSiteProfile } = await import("@/lib/profile");
      const prof = await generateSiteProfile({
        url: websiteUrl,
        displayName: status.brand_name,
      });
      if (prof.category?.trim()) categoryHint = prof.category.trim();
      if (!businessDesc && prof.business) businessDesc = prof.business;
      const primary = props.find((p) => p.website_url) ?? props[0];
      if (primary) {
        const { setSiteProfile } = await import("@/lib/db");
        setSiteProfile(primary.id, JSON.stringify(prof));
      }
    } catch (err) {
      console.warn(`[competitors] on-the-fly profile failed:`, (err as Error).message);
    }
  }

  const { competitors: detected, credits: discoveryCredits } =
    await discoverCompetitors({
      brand_name: status.brand_name,
      website_url: websiteUrl,
      category_hint: categoryHint,
      business_desc: businessDesc,
    });

  if (detected.length === 0) {
    console.log(`[competitors] workspace=${args.workspace_id} none detected`);
    return;
  }

  console.log(
    `[competitors] workspace=${args.workspace_id} detected ${detected.length}: ${detected.map((c) => c.brand_name).join(", ")}`
  );

  // Persist + ingest each.
  for (const c of detected) {
    const row = insertCompetitor({
      workspace_id: args.workspace_id,
      brand_name: c.brand_name,
      website_url: c.website_url,
      detection_query: `alternatives to ${status.brand_name}`,
      reasoning: c.reasoning,
    });
    if (row.status === "ready") continue; // skip re-ingest
    await ingestCompetitor({
      workspace_id: args.workspace_id,
      user_id: ws.user_id,
      competitor: row,
    });
  }

  console.log(
    `[competitors] workspace=${args.workspace_id} done in ${((Date.now() - t0) / 1000).toFixed(1)}s · discovery=${discoveryCredits} credits`
  );
}

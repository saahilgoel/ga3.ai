import { generateObject } from "ai";
import { z } from "zod";
import { trackedModel } from "@/lib/usage/anthropic";
import { runWithUsage } from "@/lib/usage/context";
import { getWorkspaceById, upsertProperty, setSiteProfile, type WorkspaceRow } from "@/lib/db";
import { workspaceProperties } from "@/lib/workspace";
import { generateSiteProfile } from "@/lib/profile";
import { getFreshAccessToken, getPropertyWebsiteUrl } from "@/lib/google";
import { publish } from "@/lib/pubsub";
import * as sd from "./scrapingdog";
import {
  embedAndStoreDocument,
  getContextStatus,
  insertContextDocument,
  upsertContextStatus,
} from "./db-helpers";

const CREDIT_BUDGET = 280;
const WEBSITE_PAGE_CAP = 30;
const STEP_TIMEOUT_MS = 90_000; // hard cap per step so we can't get stuck

type RunState = {
  workspace_id: number;
  user_id: number;
  brand_name: string;
  website_url: string;
  credits_used: number;
  failed: string[];
};

function publishProgress(state: RunState, step: string, pct: number, status = "crawling"): void {
  try {
    const snap = getContextStatus(state.workspace_id);
    publish(state.user_id, {
      kind: "context.progress",
      workspace_id: state.workspace_id,
      step,
      pct,
      status,
      doc_count: snap?.document_count,
      chunk_count: snap?.chunk_count,
    });
  } catch {
    // best-effort
  }
}

function stripHtml(html: unknown): { text: string; title: string | null } {
  if (typeof html !== "string" || !html) return { text: "", title: null };
  // Pull <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]?.trim() ?? null;
  // Drop scripts, styles, nav, footer, head
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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return { text: cleaned, title };
}

function stripPII(s: string): string {
  // Remove emails + phone numbers from reviews/text
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(\+?\d{1,3}[-\s.]?)?\(?\d{2,4}\)?[-\s.]?\d{3,4}[-\s.]?\d{3,4}/g, "[phone]");
}

function detectBrandName(websiteUrl: string, html: string | null): string {
  if (html) {
    // Prefer og:site_name — it's almost always the canonical brand.
    const ogMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch?.[1]) {
      const v = ogMatch[1].trim();
      if (v.length >= 2 && v.length < 60) return v;
    }
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      const t = titleMatch[1].trim();
      const parts = t.split(/[\s]+[-|—|·][\s]+/);
      if (parts[0] && parts[0].length < 60) return parts[0];
    }
  }
  try {
    const host = new URL(websiteUrl).hostname.replace(/^www\./, "");
    // Drop common platform suffixes that aren't the brand
    const root = host.split(".")[0];
    return root;
  } catch {
    return websiteUrl;
  }
}

// Higher-quality brand discovery: ask Google AI Mode "what brand is this
// website?" — this catches cases where the page title is generic (like
// "Login" / "Loading…") or the host is a meaningless slug
// (e.g. acme-checkout-ui.netlify.app → Acme Checkout).
const BRAND_ID_SCHEMA = z.object({
  brand: z
    .string()
    .min(2)
    .max(80)
    .describe("Real customer-facing brand name. Empty string if unknown."),
  confidence: z.enum(["high", "medium", "low"]),
});

async function discoverBrandViaSearch(
  websiteUrl: string
): Promise<{ brand: string | null; credits: number }> {
  // Two fast queries to AI Mode → pass results to Claude Haiku to extract
  // a single canonical brand name with confidence.
  const queries = [
    `What brand or company owns the website ${websiteUrl}? Just the company name.`,
    `Identify the customer-facing product or company name behind ${websiteUrl}.`,
  ];
  let credits = 0;
  const answers: string[] = [];
  for (const q of queries) {
    const r = await sd.googleAIOverview(q, { country: "in" });
    credits += r.credits;
    if (r.text) answers.push(r.text);
  }
  if (answers.length === 0) return { brand: null, credits };
  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: BRAND_ID_SCHEMA,
      prompt: `Identify the real customer-facing brand name for the website "${websiteUrl}". Use these search-engine answers to decide:\n\n${answers.join("\n\n---\n\n")}\n\nReturn the most specific, current brand name as customers know it. If the site has been rebranded or merged into a parent, use the current customer-facing name (e.g. if "Acme Pay is now Acme Checkout", return "Acme Checkout"). Avoid generic codenames like "acme-checkout-ui" or login-page titles.`,
    });
    const brand = object.brand.trim();
    if (object.confidence === "low" || brand.length < 2) {
      return { brand: null, credits };
    }
    return { brand, credits };
  } catch {
    return { brand: null, credits };
  }
}

async function discoverPages(
  websiteUrl: string,
  cap: number
): Promise<{ urls: string[]; credits: number }> {
  // Prefer sitemap.xml
  let base: URL;
  try {
    base = new URL(websiteUrl);
  } catch {
    return { urls: [websiteUrl], credits: 0 };
  }
  const sitemap = await sd.scrape(`${base.origin}/sitemap.xml`, { dynamic: false });
  if (sitemap.html) {
    const urls = Array.from(sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    if (urls.length > 0) {
      return { urls: prioritizePages(urls, base, cap), credits: sitemap.credits };
    }
  }
  // Fallback: just the homepage + common page patterns
  return {
    urls: [
      base.origin,
      `${base.origin}/about`,
      `${base.origin}/pricing`,
      `${base.origin}/products`,
      `${base.origin}/features`,
      `${base.origin}/blog`,
      `${base.origin}/help`,
      `${base.origin}/faq`,
      `${base.origin}/contact`,
    ].slice(0, cap),
    credits: sitemap.credits,
  };
}

function prioritizePages(urls: string[], base: URL, cap: number): string[] {
  const seen = new Set<string>();
  const dedup = urls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return u.startsWith(base.origin);
  });
  // Score by path importance
  const score = (u: string): number => {
    const p = u.toLowerCase();
    if (p === base.origin || p === `${base.origin}/`) return 100;
    if (/\/about\b/.test(p)) return 95;
    if (/\/pricing\b/.test(p)) return 92;
    if (/\/features?\b/.test(p)) return 88;
    if (/\/products?\b/.test(p)) return 85;
    if (/\/blog\b/.test(p)) return 60;
    if (/\/help\b|\/faq\b|\/docs?\b/.test(p)) return 70;
    if (/\/careers?\b/.test(p)) return 50;
    if (/\/contact\b/.test(p)) return 45;
    return 20;
  };
  return dedup
    .sort((a, b) => score(b) - score(a))
    .slice(0, cap);
}

function stepTimeout<T>(
  p: Promise<T>,
  ms: number,
  name: string,
  ac?: AbortController
): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const t = setTimeout(() => {
      console.warn(`[context] ${name} timed out after ${ms}ms`);
      // Signal the step's work to stop so an abandoned crawl/embed loop can't
      // keep consuming memory in the background (a likely OOM trigger).
      ac?.abort();
      resolve(null);
    }, ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((err) => {
      clearTimeout(t);
      console.warn(`[context] ${name} threw:`, (err as Error).message);
      resolve(null);
    });
  });
}

async function step(
  state: RunState,
  name: string,
  pct: number,
  fn: (signal: AbortSignal) => Promise<void>,
  opts: { timeoutMs?: number } = {}
): Promise<void> {
  if (state.credits_used >= CREDIT_BUDGET) {
    console.warn(`[context] skipping ${name}: budget exhausted`);
    return;
  }
  upsertContextStatus({
    workspace_id: state.workspace_id,
    current_step: name,
    progress_pct: pct,
    status: "crawling",
  });
  publishProgress(state, name, pct);
  const ac = new AbortController();
  try {
    await stepTimeout(fn(ac.signal), opts.timeoutMs ?? STEP_TIMEOUT_MS, name, ac);
    // Re-publish after the step completes so doc/chunk counts update on the strip.
    publishProgress(state, name, pct);
  } catch (err) {
    console.warn(`[context] ${name} failed:`, (err as Error).message);
    state.failed.push(name);
  }
}

// Only one context build per workspace at a time. Racing triggers
// (picker-activate, switcher-activate, manual rebuild, scheduler tick) would
// otherwise each run a full crawl and insert their own competitor rows,
// surfacing as duplicate "Studying <brand>" lines in the progress strip.
const activeBuilds = new Set<number>();
const BUILD_WATCHDOG_MS = 6 * 60_000; // whole-build hard cap

// Global concurrency cap: only one heavy context build (crawl + embed + catalog)
// runs at a time across ALL workspaces. Parallel builds were spiking memory and
// failing deploys. Excess builds queue here and drain one at a time.
const MAX_CONCURRENT_BUILDS = 1;
let activeBuildCount = 0;
const buildWaiters: Array<() => void> = [];
async function withBuildSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeBuildCount >= MAX_CONCURRENT_BUILDS) {
    await new Promise<void>((resolve) => buildWaiters.push(resolve));
  }
  activeBuildCount++;
  try {
    return await fn();
  } finally {
    activeBuildCount--;
    buildWaiters.shift()?.();
  }
}

export async function buildWorkspaceContext(workspaceId: number): Promise<void> {
  if (activeBuilds.has(workspaceId)) {
    console.log(
      `[context] build already in flight for workspace ${workspaceId}; skipping duplicate trigger`
    );
    return;
  }
  activeBuilds.add(workspaceId);
  const ownerId = getWorkspaceById(workspaceId)?.user_id ?? null;
  try {
    // Serialize heavy builds globally (slot) + whole-build watchdog so an
    // in-process hang can't run forever. Runs inside a usage context so every
    // token/credit attributes to this account + "context_build".
    await runWithUsage(
      { userId: ownerId, workspaceId, section: "context_build" },
      () =>
        withBuildSlot(() =>
          Promise.race([
            buildWorkspaceContextInner(workspaceId),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("build watchdog (6m) elapsed")),
                BUILD_WATCHDOG_MS
              )
            ),
          ])
        )
    );
  } catch (err) {
    console.warn(
      `[context] build failed for workspace ${workspaceId}:`,
      (err as Error).message
    );
    // Never leave the status stuck on "crawling": finalize it so the UI
    // recovers and a rebuild is allowed.
    try {
      const snap = getContextStatus(workspaceId) as
        | { chunk_count?: number }
        | undefined;
      const hasData = (snap?.chunk_count ?? 0) > 0;
      upsertContextStatus({
        workspace_id: workspaceId,
        status: hasData ? "partial" : "failed",
        current_step: null,
        progress_pct: hasData ? 100 : 0,
        error_text: `Build did not finish: ${(err as Error).message}`,
      });
    } catch {
      /* best effort */
    }
  } finally {
    activeBuilds.delete(workspaceId);
  }
}

async function buildWorkspaceContextInner(workspaceId: number): Promise<void> {
  const ws = getWorkspaceById(workspaceId);
  if (!ws) throw new Error("workspace_not_found");

  const props = workspaceProperties(ws);
  // Try to find a website URL — first from DB cache, then live from GA4.
  let websiteUrl = props.find((p) => p.website_url)?.website_url ?? null;
  if (!websiteUrl) {
    for (const p of props) {
      try {
        const token = await getFreshAccessToken(p.user_id);
        const fresh = await getPropertyWebsiteUrl(token, p.ga4_property_id);
        if (fresh) {
          websiteUrl = fresh;
          // Cache for next time
          upsertProperty({
            user_id: p.user_id,
            ga4_property_id: p.ga4_property_id,
            display_name: p.display_name,
            website_url: fresh,
          });
          break;
        }
      } catch (err) {
        console.warn(
          `[context] could not fetch website_url for property ${p.ga4_property_id}:`,
          (err as Error).message
        );
      }
    }
  }
  if (!websiteUrl) {
    upsertContextStatus({
      workspace_id: workspaceId,
      status: "failed",
      error_text:
        "No website URL detected for this property's web data stream. Set one in GA4 admin or add a custom URL in workspace context settings.",
    });
    return;
  }

  // Bootstrap state
  const state: RunState = {
    workspace_id: workspaceId,
    user_id: ws.user_id,
    brand_name: "",
    website_url: websiteUrl,
    credits_used: 0,
    failed: [],
  };

  upsertContextStatus({
    workspace_id: workspaceId,
    status: "crawling",
    consent_given_at: Math.floor(Date.now() / 1000),
    current_step: "Discovering brand",
    progress_pct: 1,
    error_text: null,
  });
  publishProgress(state, "Discovering brand", 1);
  console.log(`[context] starting workspace=${workspaceId} url=${websiteUrl}`);

  // ─── 1. Homepage fetch + brand detection ───
  await step(state, "Website (1/9)", 8, async (signal) => {
    const home = await sd.scrape(websiteUrl, { dynamic: true });
    state.credits_used += home.credits;
    const htmlBrand = detectBrandName(websiteUrl, home.html);

    // If the HTML-derived name looks like a slug ("foo-bar-baz") or matches
    // the bare host root, that's a bad detection. Verify with a search.
    const host = (() => {
      try {
        return new URL(websiteUrl).hostname.replace(/^www\./, "").split(".")[0];
      } catch {
        return "";
      }
    })();
    const slugShaped = /^[a-z0-9]+(-[a-z0-9]+){1,}$/i.test(htmlBrand);
    const looksGarbage =
      !htmlBrand ||
      slugShaped ||
      htmlBrand.toLowerCase() === host.toLowerCase() ||
      /loading|login|sign\s*in|home|404/i.test(htmlBrand);

    let resolvedBrand = htmlBrand;
    if (looksGarbage) {
      const search = await discoverBrandViaSearch(websiteUrl);
      state.credits_used += search.credits;
      if (search.brand) {
        console.log(
          `[context] brand search: "${htmlBrand}" → "${search.brand}" for ${websiteUrl}`
        );
        resolvedBrand = search.brand;
      } else {
        console.log(
          `[context] brand search returned nothing for ${websiteUrl}; keeping "${htmlBrand}"`
        );
      }
    }
    state.brand_name = resolvedBrand;
    upsertContextStatus({ workspace_id: workspaceId, brand_name: state.brand_name });
    if (home.html) {
      const { text, title } = stripHtml(home.html);
      if (text.length > 200) {
        await storeAndEmbed({
          workspace_id: workspaceId,
          source_type: "website",
          source_url: websiteUrl,
          title,
          content: text.slice(0, 12000),
        });
      }
    }

    // Generate/refresh the structured site profile from the RENDERED homepage so
    // `category` (which drives competitor discovery) reflects what THIS site
    // actually does — not the brand name or any parent company. Runs on every
    // build so the profile never goes stale.
    try {
      const profile = await generateSiteProfile({
        url: websiteUrl,
        displayName: state.brand_name || websiteUrl,
        html: home.html,
      });
      const primary = props.find((p) => p.website_url) ?? props[0];
      if (primary) setSiteProfile(primary.id, JSON.stringify(profile));
    } catch (err) {
      console.warn(`[context] site profile generation failed:`, (err as Error).message);
    }

    const { urls, credits } = await discoverPages(websiteUrl, WEBSITE_PAGE_CAP - 1);
    state.credits_used += credits;
    // Skip homepage we already fetched
    const others = urls.filter((u) => normalize(u) !== normalize(websiteUrl)).slice(0, WEBSITE_PAGE_CAP - 1);
    for (const url of others) {
      if (signal.aborted) break; // step timed out — stop the runaway crawl
      if (state.credits_used >= CREDIT_BUDGET * 0.4) break;
      const r = await sd.scrape(url, { dynamic: false });
      state.credits_used += r.credits;
      if (!r.html) continue;
      const { text, title } = stripHtml(r.html);
      if (text.length < 200) continue;
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "website",
        source_url: url,
        title,
        content: text.slice(0, 12000),
      });
    }
  });

  // Bail if no brand detected
  if (!state.brand_name) state.brand_name = detectBrandName(websiteUrl, null);

  // ─── 1b. Shopify catalog — if /products.json is open, paginate up to 5000
  // products and store each as a small RAG doc. Free-ish (no SD credits, just
  // direct HTTP) so we always try it.
  await step(state, "Catalog (Shopify)", 14, async () => {
    const { ingestShopifyCatalog } = await import("./catalog-shopify");
    const result = await ingestShopifyCatalog({
      workspace_id: workspaceId,
      website_url: websiteUrl,
      onProgress: (page, products) => {
        publishProgress(state, `Catalog · ${products} products`, 14);
      },
    });
    if (!result.is_shopify) {
      console.log(`[context] ws=${workspaceId} not a Shopify store`);
    }
  }, { timeoutMs: 120_000 });

  // ─── 2. AI Brief — 10 questions to Google AI Mode + 5 to ChatGPT ───
  // This is the most information-dense step: pre-synthesised, source-grounded
  // brand intelligence. We front-load it so the user has rich context even if
  // every later HTML scrape times out.
  await step(state, "AI brief (2/9)", 20, async () => {
    const { runAiBrief } = await import("./ai-brief");
    const brief = await runAiBrief({
      brand_name: state.brand_name,
      website_url: websiteUrl,
      onProgress: (done, total) => {
        // Range 20% -> 38% over the 15-question fan-out.
        const ratio = done / total;
        const pct = 20 + Math.round(ratio * 18);
        publishProgress(state, `AI brief (${done}/${total})`, pct);
      },
    });
    state.credits_used += brief.credits;
    for (const qa of brief.results) {
      if (!qa.answer || qa.answer.length < 60) continue;
      const refsBlock = qa.references.length
        ? "\n\nReferences:\n" +
          qa.references
            .slice(0, 6)
            .map((ref, i) => `[${i + 1}] ${ref.title || ref.source} — ${ref.url}`)
            .join("\n")
        : "";
      const content = `Q: ${qa.question}\n\nA: ${qa.answer}${refsBlock}`;
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: qa.source === "chatgpt" ? "ai_chatgpt" : "ai_mode",
        source_url: `${qa.source}:${qa.question.slice(0, 64)}`,
        title: qa.question.slice(0, 120),
        content,
        metadata: { source: qa.source, references: qa.references },
      });
    }
    console.log(
      `[context] ai-brief: ${brief.succeeded}/${brief.results.length} succeeded · ${brief.credits} credits`
    );
  }, { timeoutMs: 75_000 });

  // ─── 3. Brand SERP ───
  await step(state, "Brand search (3/9)", 45, async () => {
    const { results, credits } = await sd.googleSearch(state.brand_name, {
      country: "in",
      results: 30,
    });
    state.credits_used += credits;
    if (results.length === 0) return;
    // Store SERP snippets as one doc
    const summary = results
      .map((r) => `${r.position}. ${r.title}\n${r.snippet}\n${r.url}`)
      .join("\n\n");
    await storeAndEmbed({
      workspace_id: workspaceId,
      source_type: "serp",
      source_url: `google_search:${state.brand_name}`,
      title: `Brand SERP — ${state.brand_name}`,
      content: summary,
    });

    // Fetch top 10 non-owned pages
    const owned = ownedDomains(websiteUrl);
    const topNonOwned = results
      .filter((r) => !owned.some((d) => r.url.includes(d)))
      .slice(0, 10);
    for (const r of topNonOwned) {
      if (state.credits_used >= CREDIT_BUDGET * 0.6) break;
      const page = await sd.scrape(r.url, { dynamic: false });
      state.credits_used += page.credits;
      if (!page.html) continue;
      const { text } = stripHtml(page.html);
      if (text.length < 200) continue;
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "serp",
        source_url: r.url,
        title: r.title,
        content: text.slice(0, 8000),
        metadata: { serp_position: r.position },
      });
    }
  });

  // ─── 3. News (90 days) ───
  await step(state, "News mentions (4/9)", 55, async () => {
    const { results, credits } = await sd.googleNews(state.brand_name, { country: "in" });
    state.credits_used += credits;
    for (const n of results.slice(0, 30)) {
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "news",
        source_url: n.url,
        title: n.title,
        content: `${n.title}\n${n.snippet}\nsource: ${n.source} · ${n.date}`,
        metadata: { source: n.source, date: n.date },
      });
    }
    // Top 10 full-article fetch
    for (const n of results.slice(0, 10)) {
      if (state.credits_used >= CREDIT_BUDGET * 0.75) break;
      const page = await sd.scrape(n.url, { dynamic: false });
      state.credits_used += page.credits;
      if (!page.html) continue;
      const { text } = stripHtml(page.html);
      if (text.length < 300) continue;
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "news",
        source_url: n.url,
        title: `${n.title} — full article`,
        content: text.slice(0, 8000),
        metadata: { source: n.source, date: n.date, full_article: true },
      });
    }
  });

  // ─── 4. Reviews: Trustpilot, Google Maps, Indeed ───
  await step(state, "Trustpilot (5/9)", 65, async () => {
    const host = (() => {
      try {
        return new URL(websiteUrl).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })();
    if (!host) return;
    const tpUrl = `https://www.trustpilot.com/review/${host}`;
    const r = await sd.scrape(tpUrl, { dynamic: true });
    state.credits_used += r.credits;
    if (!r.html) return;
    const reviews = extractTrustpilotReviews(r.html);
    for (const rev of reviews.slice(0, 50)) {
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "review_trustpilot",
        source_url: tpUrl,
        title: `Trustpilot · ${rev.rating}/5 · ${rev.date}`,
        content: stripPII(rev.text),
        metadata: { rating: rev.rating, date: rev.date },
        atomic: true,
      });
    }
  }, { timeoutMs: 40_000 });

  await step(state, "Google Maps reviews (6/9)", 72, async () => {
    const { reviews, credits } = await sd.googleMapsReviews(state.brand_name);
    state.credits_used += credits;
    for (const rev of reviews) {
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "review_google_maps",
        title: `Google Maps · ${rev.rating}/5 · ${rev.date}`,
        content: stripPII(rev.text),
        metadata: { rating: rev.rating, date: rev.date },
        atomic: true,
      });
    }
  }, { timeoutMs: 30_000 });

  await step(state, "Indeed reviews (7/9)", 78, async () => {
    const slug = state.brand_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const indeedUrl = `https://www.indeed.com/cmp/${slug}/reviews`;
    const r = await sd.scrape(indeedUrl, { dynamic: true });
    state.credits_used += r.credits;
    if (!r.html) return;
    const reviews = extractIndeedReviews(r.html);
    for (const rev of reviews.slice(0, 20)) {
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "review_indeed",
        source_url: indeedUrl,
        title: `Indeed · ${rev.rating}/5 · ${rev.date}`,
        content: stripPII(rev.text),
        metadata: { rating: rev.rating, date: rev.date },
        atomic: true,
      });
    }
  }, { timeoutMs: 30_000 });

  // ─── 5. LinkedIn ───
  await step(state, "LinkedIn (8/9)", 85, async () => {
    // Find LinkedIn URL from previously stored SERP or via a fresh search
    const linkedinUrl = await findLinkedInUrl(state.brand_name);
    if (!linkedinUrl) return;
    const { data, credits } = await sd.linkedinCompany(linkedinUrl);
    state.credits_used += credits;
    if (!data) return;
    const desc = (data.description || data.about || "") as string;
    const followers = data.followers;
    const employeeCount = data.employee_count || data.staff_count;
    if (desc) {
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "linkedin_company",
        source_url: linkedinUrl,
        title: `${state.brand_name} — LinkedIn company`,
        content: `${desc}\n\nEmployees: ${employeeCount ?? "?"}\nFollowers: ${followers ?? "?"}`,
      });
    }
    const posts = (data.posts || data.updates || []) as Array<{ text?: string; content?: string; date?: string }>;
    for (const post of posts.slice(0, 20)) {
      const text = post.text || post.content || "";
      if (!text) continue;
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "linkedin_post",
        source_url: linkedinUrl,
        title: `LinkedIn post · ${post.date ?? "recent"}`,
        content: text,
        metadata: { date: post.date },
        atomic: true,
      });
    }
  }, { timeoutMs: 35_000 });

  // ─── 6. Twitter / X ───
  await step(state, "X mentions (9/9)", 92, async () => {
    const { results, credits } = await sd.twitterSearch(state.brand_name);
    state.credits_used += credits;
    for (const p of results.slice(0, 50)) {
      if (p.text.length < 20) continue;
      // Filter obvious bots: lots of links, no engagement, etc. Lightweight.
      if (/https?:\S+\s+https?:\S+\s+https?:\S+/.test(p.text)) continue;
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "twitter_post",
        source_url: p.url || undefined,
        title: `@${p.author || "anon"} · ${p.date || ""}`,
        content: stripPII(p.text),
        metadata: { author: p.author, date: p.date },
        atomic: true,
      });
    }
  }, { timeoutMs: 30_000 });

  // ─── Trends ───
  await step(state, "Search trends", 96, async () => {
    const { summary, credits } = await sd.googleTrends(state.brand_name);
    state.credits_used += credits;
    if (summary) {
      await storeAndEmbed({
        workspace_id: workspaceId,
        source_type: "trends_summary",
        source_url: `google_trends:${state.brand_name}`,
        title: `Search interest · ${state.brand_name}`,
        content: summary,
      });
    }
  });

  // Finalize
  const finalStatus = state.failed.length > 0 ? "partial" : "ready";
  upsertContextStatus({
    workspace_id: workspaceId,
    status: finalStatus,
    current_step: null,
    progress_pct: 100,
    failed_sources: state.failed.length > 0 ? JSON.stringify(state.failed) : null,
    last_full_refresh_at: Math.floor(Date.now() / 1000),
    last_news_refresh_at: Math.floor(Date.now() / 1000),
    last_reviews_refresh_at: Math.floor(Date.now() / 1000),
    add_credits: state.credits_used,
  });
  publishProgress(state, "Context ready", 100, finalStatus);

  // Fire-and-forget competitor build — only after own-brand context is ready
  // and only if there's credit headroom. Runs in the background so the user
  // can already use the assistant while competitor intel fills in.
  if (state.credits_used < CREDIT_BUDGET * 0.85) {
    import("./competitors")
      .then(({ buildCompetitorContext }) =>
        buildCompetitorContext({ workspace_id: workspaceId })
      )
      .catch((err) =>
        console.warn(`[context] competitor build failed:`, (err as Error).message)
      );
  } else {
    console.log(
      `[context] workspace=${workspaceId} skipping competitor build — credit budget exhausted by own-brand crawl`
    );
  }

  // Fire-and-forget industry signal feed — cheap (~5 credits) so we always run
  // it. It will detect a category on first run and surface a digest finding.
  import("./industry")
    .then(({ buildIndustrySignals }) =>
      buildIndustrySignals({ workspace_id: workspaceId })
    )
    .catch((err) =>
      console.warn(`[context] industry feed failed:`, (err as Error).message)
    );

  console.log(
    `[context] workspace=${workspaceId} done. brand="${state.brand_name}" credits=${state.credits_used} failed=[${state.failed.join(",")}]`
  );
}

async function storeAndEmbed(args: {
  workspace_id: number;
  source_type: string;
  source_url?: string;
  title?: string | null;
  content: string;
  metadata?: unknown;
  atomic?: boolean;
}): Promise<void> {
  const doc_id = insertContextDocument({
    workspace_id: args.workspace_id,
    source_type: args.source_type,
    source_url: args.source_url ?? null,
    title: args.title ?? null,
    content: args.content,
    metadata: args.metadata,
  });
  const chunks = await embedAndStoreDocument({
    document_id: doc_id,
    workspace_id: args.workspace_id,
    content: args.content,
    atomic: args.atomic,
  });
  upsertContextStatus({
    workspace_id: args.workspace_id,
    add_documents: 1,
    add_chunks: chunks,
  });
}

function normalize(u: string): string {
  return u.replace(/\/$/, "").toLowerCase();
}

function ownedDomains(url: string): string[] {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return [host];
  } catch {
    return [];
  }
}

function extractTrustpilotReviews(html: string): Array<{
  rating: number;
  text: string;
  date: string;
}> {
  // Pull JSON from Trustpilot's script tag if present
  const reviews: Array<{ rating: number; text: string; date: string }> = [];
  // Look for structured review data
  const reviewBlocks = html.match(
    /<article[^>]*data-service-review-card-paper[\s\S]*?<\/article>/g
  );
  if (reviewBlocks) {
    for (const block of reviewBlocks) {
      const rating = parseFloat(
        block.match(/data-service-review-rating="(\d)"/)?.[1] ?? "0"
      );
      const text =
        block
          .match(/<p[^>]*data-service-review-text-typography[^>]*>([\s\S]*?)<\/p>/)?.[1]
          ?.replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim() ?? "";
      const date = block.match(/datetime="([^"]+)"/)?.[1] ?? "";
      if (text.length > 20) reviews.push({ rating, text, date });
    }
  }
  return reviews;
}

function extractIndeedReviews(html: string): Array<{
  rating: number;
  text: string;
  date: string;
}> {
  // Indeed's structure varies. Try generic patterns.
  const reviews: Array<{ rating: number; text: string; date: string }> = [];
  const blocks = html.match(/<div[^>]*data-testid="review[\s\S]*?<\/div>\s*<\/div>/gi);
  if (!blocks) return reviews;
  for (const block of blocks) {
    const rating = parseFloat(block.match(/(\d(?:\.\d)?)\s*out of 5/i)?.[1] ?? "0");
    const text =
      block
        .match(/<span[^>]*data-testid="review-body[^>]*>([\s\S]*?)<\/span>/)?.[1]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() ?? "";
    if (text.length > 20) reviews.push({ rating, text, date: "" });
  }
  return reviews;
}

async function findLinkedInUrl(brandName: string): Promise<string | null> {
  // Quick targeted search
  const { results } = await sd.googleSearch(`site:linkedin.com/company ${brandName}`, {
    results: 5,
  });
  const hit = results.find((r) => r.url.includes("linkedin.com/company"));
  return hit?.url ?? null;
}

export async function refreshSource(args: {
  workspace_id: number;
  source_type: string;
}): Promise<void> {
  // Delete existing docs for the source, then re-crawl that single source.
  const { deleteSourceType } = await import("./db-helpers");
  deleteSourceType(args);

  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return;
  const status = (await import("./db-helpers")).getContextStatus(args.workspace_id);
  const brand = status?.brand_name;
  const props = workspaceProperties(ws);
  const websiteUrl = props.find((p) => p.website_url)?.website_url;
  if (!brand || !websiteUrl) return;

  const state: RunState = {
    workspace_id: args.workspace_id,
    user_id: ws.user_id,
    brand_name: brand,
    website_url: websiteUrl,
    credits_used: 0,
    failed: [],
  };
  upsertContextStatus({
    workspace_id: args.workspace_id,
    status: "crawling",
    current_step: `Refreshing ${args.source_type}`,
  });

  switch (args.source_type) {
    case "news": {
      const { results, credits } = await sd.googleNews(brand, { country: "in" });
      state.credits_used += credits;
      for (const n of results.slice(0, 30)) {
        await storeAndEmbed({
          workspace_id: args.workspace_id,
          source_type: "news",
          source_url: n.url,
          title: n.title,
          content: `${n.title}\n${n.snippet}\nsource: ${n.source} · ${n.date}`,
          metadata: { source: n.source, date: n.date },
        });
      }
      break;
    }
    case "twitter_post": {
      const { results, credits } = await sd.twitterSearch(brand);
      state.credits_used += credits;
      for (const p of results.slice(0, 50)) {
        if (p.text.length < 20) continue;
        await storeAndEmbed({
          workspace_id: args.workspace_id,
          source_type: "twitter_post",
          source_url: p.url || undefined,
          title: `@${p.author || "anon"} · ${p.date || ""}`,
          content: stripPII(p.text),
          atomic: true,
        });
      }
      break;
    }
    default:
      // For now, full source refresh; could specialize others later.
      break;
  }

  upsertContextStatus({
    workspace_id: args.workspace_id,
    status: "ready",
    current_step: null,
    progress_pct: 100,
    add_credits: state.credits_used,
    ...(args.source_type === "news"
      ? { last_news_refresh_at: Math.floor(Date.now() / 1000) }
      : {}),
  });

  // Onboarding + RAG just finished → launch the first focused scan so the
  // newsroom lands populated with sharp, business-aware insights. maybeAutoScan
  // self-gates (no-ops if a scan ran in the last 24h), so calling it on every
  // ready transition is safe. Dynamic import avoids load-order coupling.
  import("../scan")
    .then(({ maybeAutoScan }) => maybeAutoScan(args.workspace_id))
    .catch(() => {});
}

// Competitor ad creative library — scrape Meta Ad Library + Google Ads
// Transparency Report for each detected competitor, extract structured ad
// data (headline, body, CTA, image/video URLs), and store as embedded docs
// tagged to the competitor.
//
// The HTML for Meta/Google ad libraries is brittle (frequent layout changes)
// so we use Claude Haiku on the rendered text to extract structured ads
// rather than hand-rolled selectors. ~5 ScrapingDog credits per competitor
// (dynamic page) × 2 networks = ~10 credits per competitor per refresh.

import { trackedModel } from "@/lib/usage/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getDb, getWorkspaceById } from "@/lib/db";
import { publish } from "@/lib/pubsub";
import * as sd from "./scrapingdog";
import {
  embedAndStoreDocument,
  insertContextDocument,
} from "./db-helpers";
import {
  listCompetitors,
  updateCompetitor,
  type CompetitorRow,
} from "./competitors-db";

const REFRESH_INTERVAL_MS = 24 * 60 * 60_000;
const MAX_ADS_PER_NETWORK = 15;

const AdSchema = z.object({
  headline: z
    .string()
    .min(2)
    .max(160)
    .describe("The bold short text at the top of the ad (the hook). Empty if not visible."),
  body: z
    .string()
    .max(800)
    .describe("Body copy of the ad — the longer descriptive text."),
  cta: z
    .string()
    .max(60)
    .nullable()
    .describe("Call-to-action button text (e.g. 'Shop Now', 'Learn More'), or null."),
  format: z
    .enum(["image", "video", "carousel", "unknown"])
    .describe("Visual format of the ad."),
  image_url: z
    .string()
    .nullable()
    .describe("Primary image URL extracted from the ad, or null if not extractable."),
  landing_url: z
    .string()
    .nullable()
    .describe("Destination URL the ad links to, or null."),
  active_since: z
    .string()
    .max(40)
    .nullable()
    .describe("When the ad started running (e.g. 'May 1, 2026'), or null."),
  platforms: z
    .array(z.string().max(20))
    .max(8)
    .describe("Platforms it runs on (e.g. ['Facebook', 'Instagram']). Empty array if unknown."),
});

const AdBatchSchema = z.object({
  ads: z.array(AdSchema).max(MAX_ADS_PER_NETWORK),
  creative_angle_summary: z
    .string()
    .min(20)
    .max(600)
    .describe(
      "2-3 sentences describing the dominant creative angle / positioning across these ads. What benefit are they leading with? What audience are they targeting? Plain text, no emojis."
    ),
});

export type ExtractedAd = z.infer<typeof AdSchema>;

function publishAdsProgress(args: {
  user_id: number;
  workspace_id: number;
  competitor_id: number;
  brand_name: string;
  step: string;
  pct: number;
  status: string;
}): void {
  try {
    publish(args.user_id, {
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

function stripHtmlKeepingTextAndImages(html: string): string {
  if (typeof html !== "string" || !html) return "";
  // Keep <img> src URLs visible to the LLM by inlining them as text tokens,
  // then strip everything else. Cap to keep token cost in check.
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  // Surface image sources — Meta uses both scontent.* and fbcdn for ad creatives.
  out = out.replace(
    /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
    (_m, src) => ` [IMG: ${src}] `
  );
  // Surface link destinations
  out = out.replace(
    /<a[^>]+href=["']([^"']+)["'][^>]*>/gi,
    (_m, href) => ` [HREF: ${href}] `
  );
  out = out
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return out.slice(0, 60000);
}

// Lightweight pre-extraction: count "Library ID" / "Launched" markers — if the
// page has none, the brand has no active ads and we should short-circuit
// before paying for an LLM extraction call.
function quickAdCount(html: string): number {
  if (typeof html !== "string" || !html) return 0;
  const libraryMatches = html.match(/Library ID:?\s*\d+/gi);
  return libraryMatches ? libraryMatches.length : 0;
}

// Extract candidate ad-creative image URLs from raw Meta Ad Library HTML.
// Meta serves ad images from *.fbcdn.net (and external.fbcdn.net for some
// external creatives). We grab anything pointing to .jpg/.png/.webp on those
// CDNs, drop obvious UI / emoji / logo assets, and dedupe by URL.
function extractMetaImageCandidates(html: string): string[] {
  if (typeof html !== "string" || !html) return [];
  const matches = html.match(
    /https?:\/\/[^"'\s)<>]*?fbcdn\.net\/[^"'\s)<>]+/gi
  );
  if (!matches) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of matches) {
    // Unescape JSON-style backslashes that survived our HTML scrub.
    const url = raw.replace(/\\\//g, "/");
    if (!/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) continue;
    // Drop UI chrome — emojis, rsrc, static profile assets, tiny avatars.
    if (/static\.xx\.fbcdn|emoji\.php|rsrc\.php|\/rsrc\//i.test(url)) continue;
    if (/\/v\/t39\.\d+-\d+\/[^"]+_n\.gif/i.test(url)) continue; // tiny gifs
    // Strip anchors (these break <img>)
    const clean = url.replace(/#[^"]*$/, "");
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 80) break; // generous cap
  }
  return out;
}

// Extract candidate "Library ID:" values in document order so we can pair
// images and library ids if needed later.
function extractLibraryIds(html: string): string[] {
  if (typeof html !== "string" || !html) return [];
  const out: string[] = [];
  const re = /Library ID:?\s*(\d{6,})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

async function extractAdsFromHtml(args: {
  brand_name: string;
  network: "meta" | "google";
  html: string;
}): Promise<{ ads: ExtractedAd[]; angle_summary: string } | null> {
  const text = stripHtmlKeepingTextAndImages(args.html);
  // Cheap pre-check: skip the LLM call if the page doesn't look like it has ads
  if (text.length < 500) return null;
  if (
    args.network === "meta" &&
    /no\s+ads\s+match|0\s+ads|couldn'?t\s+find\s+results/i.test(text)
  ) {
    return null;
  }

  // Pre-extract candidate ad creative image URLs from raw HTML — Meta hides
  // these inside JSON blobs the LLM otherwise misses. We pass them as a
  // numbered list, and post-fill any nulls in order as a fallback.
  let candidateImages: string[] = [];
  if (args.network === "meta") {
    const hint = quickAdCount(args.html);
    candidateImages = extractMetaImageCandidates(args.html);
    console.log(
      `[ads] ${args.brand_name} meta page: ${hint} library_ids, ${candidateImages.length} image candidates`
    );
    // STRICT GATE: Meta Ad Library is a JS SPA and ScrapingDog snapshots
    // it before ads render. If we don't see BOTH Library ID markers AND at
    // least a couple of fbcdn image candidates, the snapshot is empty and
    // the LLM will hallucinate ads from blank chrome. Refuse to extract.
    if (hint < 1 || candidateImages.length < 2) {
      console.log(
        `[ads] ${args.brand_name} meta snapshot looks empty (library_ids=${hint}, candidates=${candidateImages.length}) — skipping LLM extract to avoid hallucinations`
      );
      return null;
    }
  }

  const imageBlock =
    candidateImages.length > 0
      ? `\n\nCANDIDATE IMAGE URLS (in document order — assign each ad the most likely creative URL by position):\n${candidateImages
          .map((u, i) => `[${i + 1}] ${u}`)
          .join("\n")}\n`
      : "";

  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: AdBatchSchema,
      prompt: `Extract structured ad data from this ${args.network === "meta" ? "Meta Ad Library" : "Google Ads Transparency Report"} page for "${args.brand_name}". Return up to ${MAX_ADS_PER_NETWORK} ads.

Each ad block usually contains: headline text, body copy, a CTA button, an image, and a landing URL (shown in text as [HREF: url]).${imageBlock}
For the image_url field of each ad, use one of the CANDIDATE IMAGE URLS above when one matches the ad's position on the page. If you can't tell which image goes with which ad, still pick the closest one rather than null.

If the page has no ads or is a "no results" screen, return ads:[] and a one-line angle_summary saying so.

Page contents:
${text}`,
    });
    // Post-fill: any ad with null image_url that's still missing one gets the
    // next unused candidate, in order. Stops the LLM from leaving image_url
    // null when there's an obvious candidate available.
    const usedImages = new Set(
      object.ads.map((a) => a.image_url).filter((u): u is string => !!u)
    );
    const unused = candidateImages.filter((u) => !usedImages.has(u));
    let unusedIdx = 0;
    const filledAds = object.ads.map((ad, i) => {
      if (ad.image_url) return ad;
      // Prefer the candidate at the same position if free
      const positional = candidateImages[i];
      if (positional && !usedImages.has(positional)) {
        usedImages.add(positional);
        return { ...ad, image_url: positional };
      }
      if (unusedIdx < unused.length) {
        const pick = unused[unusedIdx++];
        usedImages.add(pick);
        return { ...ad, image_url: pick };
      }
      return ad;
    });

    return {
      ads: filledAds,
      angle_summary: object.creative_angle_summary,
    };
  } catch (err) {
    console.warn(
      `[ads] ${args.network} extract failed for ${args.brand_name}:`,
      (err as Error).message
    );
    return null;
  }
}

// Silence "unused" until we plumb library_id-keyed ad detail pages.
void extractLibraryIds;

function metaLibraryUrl(brandName: string): string {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country: "IN",
    q: brandName,
    search_type: "keyword_unordered",
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

function googleTransparencyUrl(args: {
  websiteUrl: string | null;
  brandName: string;
}): string {
  // Prefer domain-based query when we have a website; fall back to brand name.
  if (args.websiteUrl) {
    try {
      const host = new URL(args.websiteUrl).hostname.replace(/^www\./, "");
      return `https://adstransparency.google.com/?domain=${encodeURIComponent(host)}&region=IN`;
    } catch {
      // fall through
    }
  }
  return `https://adstransparency.google.com/?advertiser=${encodeURIComponent(args.brandName)}&region=IN`;
}

async function ingestNetwork(args: {
  workspace_id: number;
  user_id: number;
  competitor: CompetitorRow;
  network: "meta" | "google";
  url: string;
}): Promise<{ credits: number; ads_count: number; docs_added: number; chunks_added: number }> {
  const { workspace_id, competitor, network, url } = args;
  let creditsUsed = 0;
  let docsAdded = 0;
  let chunksAdded = 0;

  // Both Meta and Google ad libraries are JS SPAs that lazy-load ads after
  // the page shell renders. We need `wait` + `premium` for the snapshot to
  // catch real ad data instead of an empty shell (which the LLM would
  // happily hallucinate around).
  const page = await sd.scrape(url, {
    dynamic: true,
    waitMs: 15_000,
    premium: true,
  });
  creditsUsed += page.credits;
  if (!page.html) {
    return { credits: creditsUsed, ads_count: 0, docs_added: 0, chunks_added: 0 };
  }

  const extracted = await extractAdsFromHtml({
    brand_name: competitor.brand_name,
    network,
    html: page.html,
  });
  if (!extracted || extracted.ads.length === 0) {
    // Still store the angle summary as a "no ads" signal so the agent can
    // tell the user the competitor is dark on this network.
    if (extracted?.angle_summary) {
      try {
        const doc_id = insertContextDocument({
          workspace_id,
          source_type: network === "meta" ? "competitor_ad_meta" : "competitor_ad_google",
          source_url: url,
          title: `${competitor.brand_name} — ${network === "meta" ? "Meta" : "Google"} ads (no active ads)`,
          content: extracted.angle_summary,
          metadata: { network, no_ads: true },
          competitor_id: competitor.id,
        });
        const chunks = await embedAndStoreDocument({
          document_id: doc_id,
          workspace_id,
          content: extracted.angle_summary,
        });
        docsAdded += 1;
        chunksAdded += chunks;
      } catch (err) {
        console.warn(`[ads] no-ads doc insert failed:`, (err as Error).message);
      }
    }
    return { credits: creditsUsed, ads_count: 0, docs_added: docsAdded, chunks_added: chunksAdded };
  }

  // One document per ad (so retrieval can surface a specific creative).
  for (const ad of extracted.ads) {
    const lines = [
      ad.headline && `Headline: ${ad.headline}`,
      ad.body && `Body: ${ad.body}`,
      ad.cta && `CTA: ${ad.cta}`,
      ad.format && `Format: ${ad.format}`,
      ad.platforms.length > 0 && `Platforms: ${ad.platforms.join(", ")}`,
      ad.active_since && `Active since: ${ad.active_since}`,
      ad.landing_url && `Landing: ${ad.landing_url}`,
      ad.image_url && `Image: ${ad.image_url}`,
    ]
      .filter(Boolean)
      .join("\n");
    if (lines.trim().length < 30) continue;
    try {
      const doc_id = insertContextDocument({
        workspace_id,
        source_type:
          network === "meta" ? "competitor_ad_meta" : "competitor_ad_google",
        source_url: ad.landing_url || url,
        title: `${competitor.brand_name} — ${ad.headline?.slice(0, 80) || `${network} ad`}`,
        content: lines,
        metadata: {
          network,
          image_url: ad.image_url,
          landing_url: ad.landing_url,
          cta: ad.cta,
          format: ad.format,
          platforms: ad.platforms,
          active_since: ad.active_since,
        },
        competitor_id: competitor.id,
      });
      const chunks = await embedAndStoreDocument({
        document_id: doc_id,
        workspace_id,
        content: lines,
        atomic: true,
      });
      docsAdded += 1;
      chunksAdded += chunks;
    } catch (err) {
      console.warn(`[ads] doc insert failed:`, (err as Error).message);
    }
  }

  // Store the creative-angle summary as a separate doc (good for "what's
  // their angle?" queries — retrieval will lift the summary first).
  try {
    const doc_id = insertContextDocument({
      workspace_id,
      source_type: "competitor_ad_creative_angle",
      source_url: url,
      title: `${competitor.brand_name} — ${network === "meta" ? "Meta" : "Google"} creative angle`,
      content: extracted.angle_summary,
      metadata: { network, ad_count: extracted.ads.length },
      competitor_id: competitor.id,
    });
    const chunks = await embedAndStoreDocument({
      document_id: doc_id,
      workspace_id,
      content: extracted.angle_summary,
    });
    docsAdded += 1;
    chunksAdded += chunks;
  } catch (err) {
    console.warn(`[ads] angle doc insert failed:`, (err as Error).message);
  }

  return {
    credits: creditsUsed,
    ads_count: extracted.ads.length,
    docs_added: docsAdded,
    chunks_added: chunksAdded,
  };
}

export async function buildCompetitorAds(args: {
  workspace_id: number;
  competitor_id?: number;
  force?: boolean;
}): Promise<void> {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return;

  const all = listCompetitors(args.workspace_id);
  const targets = args.competitor_id
    ? all.filter((c) => c.id === args.competitor_id)
    : all.filter((c) => c.status === "ready" || c.status === "partial");

  if (targets.length === 0) {
    console.log(
      `[ads] ws=${args.workspace_id} no eligible competitors (need own-brand competitor ingest first)`
    );
    return;
  }

  for (const competitor of targets) {
    // Per-competitor refresh gate
    if (!args.force) {
      const lastAdIngestRow = getDb()
        .prepare(
          `SELECT MAX(fetched_at) as last
           FROM context_documents
           WHERE workspace_id = ? AND competitor_id = ?
             AND source_type IN ('competitor_ad_meta','competitor_ad_google','competitor_ad_creative_angle')`
        )
        .get(args.workspace_id, competitor.id) as
        | { last: number | null }
        | undefined;
      const lastAt = lastAdIngestRow?.last;
      if (lastAt && Date.now() - lastAt * 1000 < REFRESH_INTERVAL_MS) {
        continue;
      }
    }

    const t0 = Date.now();
    publishAdsProgress({
      user_id: ws.user_id,
      workspace_id: args.workspace_id,
      competitor_id: competitor.id,
      brand_name: competitor.brand_name,
      step: "Scanning ad libraries",
      pct: 20,
      status: "crawling",
    });

    let totalCredits = 0;
    let totalAds = 0;
    let totalDocs = 0;
    let totalChunks = 0;

    // Meta Ad Library
    try {
      const meta = await ingestNetwork({
        workspace_id: args.workspace_id,
        user_id: ws.user_id,
        competitor,
        network: "meta",
        url: metaLibraryUrl(competitor.brand_name),
      });
      totalCredits += meta.credits;
      totalAds += meta.ads_count;
      totalDocs += meta.docs_added;
      totalChunks += meta.chunks_added;
      publishAdsProgress({
        user_id: ws.user_id,
        workspace_id: args.workspace_id,
        competitor_id: competitor.id,
        brand_name: competitor.brand_name,
        step: `Meta · ${meta.ads_count} ads`,
        pct: 55,
        status: "crawling",
      });
    } catch (err) {
      console.warn(
        `[ads] meta ingest failed for ${competitor.brand_name}:`,
        (err as Error).message
      );
    }

    // Google Ads Transparency Report
    try {
      const google = await ingestNetwork({
        workspace_id: args.workspace_id,
        user_id: ws.user_id,
        competitor,
        network: "google",
        url: googleTransparencyUrl({
          websiteUrl: competitor.website_url,
          brandName: competitor.brand_name,
        }),
      });
      totalCredits += google.credits;
      totalAds += google.ads_count;
      totalDocs += google.docs_added;
      totalChunks += google.chunks_added;
      publishAdsProgress({
        user_id: ws.user_id,
        workspace_id: args.workspace_id,
        competitor_id: competitor.id,
        brand_name: competitor.brand_name,
        step: `Google · ${google.ads_count} ads`,
        pct: 90,
        status: "crawling",
      });
    } catch (err) {
      console.warn(
        `[ads] google ingest failed for ${competitor.brand_name}:`,
        (err as Error).message
      );
    }

    updateCompetitor({
      id: competitor.id,
      add_credits: totalCredits,
      add_documents: totalDocs,
      add_chunks: totalChunks,
    });

    publishAdsProgress({
      user_id: ws.user_id,
      workspace_id: args.workspace_id,
      competitor_id: competitor.id,
      brand_name: competitor.brand_name,
      step: totalAds > 0 ? `${totalAds} ads captured` : "no live ads",
      pct: 100,
      status: "ready",
    });
    console.log(
      `[ads] ${competitor.brand_name} (ws=${args.workspace_id}) done in ${((Date.now() - t0) / 1000).toFixed(1)}s · ${totalAds} ads · ${totalCredits} credits`
    );
  }
}

export type CompetitorAdSummary = {
  competitor_id: number;
  brand_name: string;
  network: "meta" | "google";
  headline: string | null;
  body: string | null;
  cta: string | null;
  format: string | null;
  image_url: string | null;
  landing_url: string | null;
  platforms: string[];
  active_since: string | null;
  fetched_at: number;
};

export function listCompetitorAds(args: {
  workspace_id: number;
  competitor_id?: number;
  limit?: number;
}): CompetitorAdSummary[] {
  const limit = Math.min(args.limit ?? 24, 50);
  const params: Array<number | string> = [args.workspace_id];
  let where = "d.workspace_id = ? AND d.source_type IN ('competitor_ad_meta','competitor_ad_google')";
  if (args.competitor_id) {
    where += " AND d.competitor_id = ?";
    params.push(args.competitor_id);
  }
  const rows = getDb()
    .prepare(
      `SELECT d.id, d.competitor_id, d.source_type, d.title, d.metadata_json,
              d.fetched_at, c.brand_name
       FROM context_documents d
       JOIN competitors c ON c.id = d.competitor_id
       WHERE ${where}
       ORDER BY d.fetched_at DESC
       LIMIT ${limit}`
    )
    .all(...params) as Array<{
      id: number;
      competitor_id: number;
      source_type: string;
      title: string | null;
      metadata_json: string | null;
      fetched_at: number;
      brand_name: string;
    }>;

  return rows.map((r) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = r.metadata_json ? (JSON.parse(r.metadata_json) as Record<string, unknown>) : {};
    } catch {
      meta = {};
    }
    return {
      competitor_id: r.competitor_id,
      brand_name: r.brand_name,
      network: r.source_type === "competitor_ad_meta" ? "meta" : "google",
      headline: typeof r.title === "string" ? r.title.replace(/^.*?\s—\s/, "") : null,
      body: null,
      cta: (meta.cta as string) ?? null,
      format: (meta.format as string) ?? null,
      image_url: (meta.image_url as string) ?? null,
      landing_url: (meta.landing_url as string) ?? null,
      platforms: Array.isArray(meta.platforms) ? (meta.platforms as string[]) : [],
      active_since: (meta.active_since as string) ?? null,
      fetched_at: r.fetched_at,
    };
  });
}

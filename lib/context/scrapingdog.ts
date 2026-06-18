// ScrapingDog API client with a concurrent-request semaphore and credit accounting.

import { recordUsage } from "@/lib/usage/record";

const API_BASE = "https://api.scrapingdog.com";
const MAX_CONCURRENCY = 3;

let inFlight = 0;
const queue: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENCY) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  inFlight++;
}

function release(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

type FetchOpts = {
  timeoutMs?: number;
};

async function call<T>(
  url: string,
  opts: FetchOpts = {}
): Promise<{ data: T | null; status: number; ok: boolean; credits: number }> {
  await acquire();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const credits = 1; // approximate; SD bills per call. Could parse headers.
    // Attribute to the active usage context (account + section). Defensive.
    recordUsage({ provider: "scrapingdog", credits });
    if (!res.ok) {
      return { data: null, status: res.status, ok: false, credits };
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as T;
      return { data, status: res.status, ok: true, credits };
    }
    const text = (await res.text()) as unknown as T;
    return { data: text, status: res.status, ok: true, credits };
  } catch (err) {
    console.warn("[scrapingdog] fetch failed:", (err as Error).message);
    return { data: null, status: 0, ok: false, credits: 0 };
  } finally {
    clearTimeout(timeout);
    release();
  }
}

function key(): string {
  return process.env.SCRAPINGDOG_API_KEY || "";
}

// 1. Scrape a single page (HTML → string)
export async function scrape(
  url: string,
  opts: {
    dynamic?: boolean;
    /** ms to wait after page load before snapshotting — needed for JS-heavy SPAs (Meta Ad Library, etc.). */
    waitMs?: number;
    /** Use ScrapingDog's premium proxy pool — required for Meta, costs more credits. */
    premium?: boolean;
  } = {}
): Promise<{ html: string | null; credits: number }> {
  const params = new URLSearchParams({
    api_key: key(),
    url,
    dynamic: opts.dynamic ? "true" : "false",
  });
  if (opts.waitMs && opts.waitMs > 0) {
    params.set("wait", String(opts.waitMs));
  }
  if (opts.premium) {
    params.set("premium", "true");
  }
  // ScrapingDog responses for premium dynamic scrapes can take 30-90s.
  const timeoutMs = opts.premium || (opts.waitMs ?? 0) > 5_000 ? 120_000 : 30_000;
  const r = await call<unknown>(`${API_BASE}/scrape?${params}`, { timeoutMs });
  // Normalise: SD sometimes returns a JSON error payload with application/json
  // content-type, which gets typed as the generic but is actually an object.
  // Downstream code calls .match() on this; we have to coerce to string|null.
  let html: string | null = null;
  if (typeof r.data === "string") {
    html = r.data;
  } else if (r.data && typeof r.data === "object") {
    const obj = r.data as Record<string, unknown>;
    if (typeof obj.html === "string") html = obj.html;
    else if (typeof obj.body === "string") html = obj.body;
    else if (typeof obj.content === "string") html = obj.content;
    // If it's just a JSON error, log and return null.
    if (html === null) {
      console.warn(
        `[scrapingdog] scrape returned non-string data for ${url}:`,
        JSON.stringify(obj).slice(0, 200)
      );
    }
  }
  return { html, credits: r.credits };
}

// 2. Google organic search
export type SerpResult = {
  position: number;
  title: string;
  snippet: string;
  url: string;
};
export async function googleSearch(
  query: string,
  opts: { country?: string; results?: number } = {}
): Promise<{ results: SerpResult[]; credits: number }> {
  const params = new URLSearchParams({
    api_key: key(),
    query,
    country: opts.country || "in",
    results: String(opts.results || 30),
  });
  const r = await call<{ organic_results?: Array<{ rank?: number; position?: number; title?: string; snippet?: string; description?: string; link?: string; url?: string }> }>(
    `${API_BASE}/google?${params}`
  );
  if (!r.ok || !r.data) return { results: [], credits: r.credits };
  const organic = r.data.organic_results || [];
  return {
    results: organic
      .map((o, i) => ({
        position: o.position ?? o.rank ?? i + 1,
        title: o.title || "",
        snippet: o.snippet || o.description || "",
        url: o.link || o.url || "",
      }))
      .filter((o) => !!o.url),
    credits: r.credits,
  };
}

// 3. Google News
export type NewsResult = {
  title: string;
  snippet: string;
  source: string;
  date: string;
  url: string;
};
export async function googleNews(
  query: string,
  opts: { country?: string } = {}
): Promise<{ results: NewsResult[]; credits: number }> {
  const params = new URLSearchParams({
    api_key: key(),
    query,
    country: opts.country || "in",
  });
  const r = await call<{ news_results?: Array<{ title?: string; snippet?: string; description?: string; source?: string; date?: string; link?: string; url?: string }> }>(
    `${API_BASE}/google_news?${params}`
  );
  if (!r.ok || !r.data) return { results: [], credits: r.credits };
  const news = r.data.news_results || [];
  return {
    results: news
      .map((n) => ({
        title: n.title || "",
        snippet: n.snippet || n.description || "",
        source: n.source || "",
        date: n.date || "",
        url: n.link || n.url || "",
      }))
      .filter((n) => !!n.url),
    credits: r.credits,
  };
}

// 4. LinkedIn company
export async function linkedinCompany(
  linkedinUrl: string
): Promise<{ data: Record<string, unknown> | null; credits: number }> {
  const params = new URLSearchParams({ api_key: key(), url: linkedinUrl });
  const r = await call<Record<string, unknown>>(`${API_BASE}/linkedin/company?${params}`);
  return { data: r.data, credits: r.credits };
}

// 5. Twitter / X search
export type TwitterPost = {
  text: string;
  author: string;
  date: string;
  url: string;
};
export async function twitterSearch(
  query: string
): Promise<{ results: TwitterPost[]; credits: number }> {
  const params = new URLSearchParams({ api_key: key(), query });
  const r = await call<{ results?: Array<{ text?: string; content?: string; user?: { screen_name?: string; username?: string }; author?: string; date?: string; url?: string }> }>(
    `${API_BASE}/x?${params}`
  );
  if (!r.ok || !r.data) return { results: [], credits: r.credits };
  const posts = r.data.results || [];
  return {
    results: posts
      .map((p) => ({
        text: p.text || p.content || "",
        author: p.user?.screen_name || p.user?.username || p.author || "",
        date: p.date || "",
        url: p.url || "",
      }))
      .filter((p) => !!p.text),
    credits: r.credits,
  };
}

// 5b. LinkedIn Jobs — returns structured job listings.
// Endpoint: /linkedinjobs?field=<keyword>&geoid=<geo>
// geoid 102713980 = India; 103644278 = United States; 101174742 = UK.
export type LinkedInJob = {
  title: string;
  url: string;
  company: string;
  company_url: string;
  location: string;
  posted_at: string;
  logo: string | null;
};
export async function linkedinJobs(args: {
  keyword: string;
  geoid?: string;
  limit?: number;
}): Promise<{ jobs: LinkedInJob[]; credits: number }> {
  const params = new URLSearchParams({
    api_key: key(),
    field: args.keyword,
    geoid: args.geoid || "102713980", // default India
  });
  const r = await call<
    Array<{
      job_position?: string;
      job_link?: string;
      job_id?: string;
      company_name?: string;
      company_profile?: string;
      job_location?: string;
      job_posting_date?: string;
      company_logo_url?: string;
    }>
  >(`${API_BASE}/linkedinjobs?${params}`);
  if (!r.ok || !Array.isArray(r.data)) return { jobs: [], credits: r.credits };
  const jobs: LinkedInJob[] = r.data
    .filter((j) => j.job_position && j.job_link)
    .map((j) => ({
      title: j.job_position || "",
      url: j.job_link || "",
      company: j.company_name || "",
      company_url: j.company_profile || "",
      location: j.job_location || "",
      posted_at: j.job_posting_date || "",
      logo: j.company_logo_url || null,
    }));
  return {
    jobs: jobs.slice(0, args.limit ?? 25),
    credits: r.credits,
  };
}

// 6. Google AI Mode — grounded answers backed by Google search results.
// Endpoint: /google/ai_mode · 10 credits per call.
// CONFIRMED RESPONSE SHAPE (tested live):
//   {
//     text_blocks: [
//       { type: "paragraph", snippet: "...", links: [...], citation_links: [...] },
//       { type: "list", list: [{ snippet: "..." }] }
//     ],
//     // also a top-level citation_links sometimes
//   }
type AiModeCitation = {
  title?: string;
  link?: string;
  snippet?: string;
  source?: string;
  favicon?: string;
};
type AiModeBlock = {
  type?: string;
  snippet?: string;
  text?: string;
  list?: Array<{ snippet?: string; text?: string }>;
  citation_links?: AiModeCitation[];
  links?: Array<{ anchor?: string; link?: string }>;
};
export async function googleAIOverview(
  query: string,
  opts: { country?: string } = {}
): Promise<{
  text: string | null;
  references: Array<{ title: string; url: string; source: string; snippet: string }>;
  credits: number;
}> {
  const params = new URLSearchParams({
    api_key: key(),
    query,
    country: opts.country || "in",
  });
  // ScrapingDog returns snake_case fields. The original docs suggested camelCase
  // (textBlocks/references) but the live API actually uses text_blocks/citation_links.
  // We accept both shapes for forward-compat.
  const r = await call<{
    text_blocks?: AiModeBlock[];
    textBlocks?: AiModeBlock[];
    citation_links?: AiModeCitation[];
    references?: AiModeCitation[];
  }>(`${API_BASE}/google/ai_mode?${params}`);
  if (!r.ok || !r.data) return { text: null, references: [], credits: r.credits };
  const blocks = r.data.text_blocks || r.data.textBlocks || [];
  if (blocks.length === 0) return { text: null, references: [], credits: r.credits };
  const parts: string[] = [];
  const refMap = new Map<string, AiModeCitation>();
  for (const b of blocks) {
    if (b.type === "list" && Array.isArray(b.list)) {
      for (const it of b.list) {
        const s = it.snippet || it.text;
        if (s) parts.push(`• ${s}`);
      }
    } else {
      const s = b.snippet || b.text;
      if (s) parts.push(s);
    }
    for (const c of b.citation_links ?? []) {
      if (c.link && !refMap.has(c.link)) refMap.set(c.link, c);
    }
  }
  // Top-level citations (some queries return them outside blocks).
  for (const c of r.data.citation_links ?? r.data.references ?? []) {
    if (c.link && !refMap.has(c.link)) refMap.set(c.link, c);
  }
  const text = parts.join("\n\n").trim() || null;
  const references = Array.from(refMap.values()).map((ref) => ({
    title: ref.title || "",
    url: ref.link || "",
    source: ref.source || "",
    snippet: ref.snippet || "",
  }));
  return { text, references, credits: r.credits };
}

// 6b. ChatGPT — free-form prompt → synthesised answer.
// Endpoint: /chatgpt · returns { conversation: [{role, message|response: [{type,text}]}] }.
export async function chatgptAsk(
  prompt: string
): Promise<{ text: string | null; credits: number }> {
  const params = new URLSearchParams({ api_key: key(), prompt });
  type ChatBlock = {
    type?: string;
    text?: string;
    items?: Array<{ text?: string; snippet?: string }>;
  };
  type ChatTurn = {
    role?: string;
    message?: string;
    response?: ChatBlock[] | string;
  };
  const r = await call<{ conversation?: ChatTurn[] }>(`${API_BASE}/chatgpt?${params}`);
  if (!r.ok || !r.data) return { text: null, credits: r.credits };
  const turns = r.data.conversation || [];
  const assistant = turns.find((t) => t.role === "assistant");
  if (!assistant) return { text: null, credits: r.credits };
  if (typeof assistant.response === "string") {
    return { text: assistant.response, credits: r.credits };
  }
  const blocks = assistant.response || [];
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "numbered_list" || b.type === "bulleted_list") {
      if (Array.isArray(b.items)) {
        for (const it of b.items) {
          const t = it.text || it.snippet;
          if (t) parts.push(`• ${t}`);
        }
      }
    } else if (b.text) {
      parts.push(b.text);
    }
  }
  return { text: parts.join("\n\n").trim() || null, credits: r.credits };
}

// 7b. Google Trends — regional breakdown for plotting on a map.
// Endpoint: /google_trends?data_type=GEO_MAP&query=X&geo=IN
export type RegionInterest = {
  geo: string; // ISO sub-region (e.g. IN-DL, IN-MH)
  location: string;
  value: number; // 0-100
};
export async function googleTrendsByRegion(
  query: string,
  opts: { geo?: string } = {}
): Promise<{ regions: RegionInterest[]; credits: number }> {
  const params = new URLSearchParams({
    api_key: key(),
    query,
    geo: opts.geo || "IN",
    data_type: "GEO_MAP",
  });
  const r = await call<{
    compared_breakdown_by_region?: Array<{
      geo?: string;
      location?: string;
      values?: Array<{ value?: number; extracted_value?: string }>;
    }>;
  }>(`${API_BASE}/google_trends?${params}`);
  if (!r.ok || !r.data) return { regions: [], credits: r.credits };
  const rows = r.data.compared_breakdown_by_region || [];
  const regions: RegionInterest[] = rows
    .map((row) => ({
      geo: row.geo || "",
      location: row.location || "",
      value: Number(row.values?.[0]?.value ?? row.values?.[0]?.extracted_value ?? 0),
    }))
    .filter((row) => row.geo && row.value > 0);
  return { regions, credits: r.credits };
}

// 7. Google Trends — single-summary form used by orchestrator step 8.
export async function googleTrends(
  query: string
): Promise<{ summary: string | null; credits: number }> {
  const params = new URLSearchParams({ api_key: key(), query });
  const r = await call<Record<string, unknown>>(`${API_BASE}/google_trends?${params}`);
  if (!r.ok || !r.data) return { summary: null, credits: r.credits };
  // ScrapingDog returns time-series data; we summarize to one chunk.
  const interest = r.data["interest_over_time"] as
    | Array<{ value?: number; date?: string }>
    | undefined;
  if (!interest || interest.length === 0) {
    return { summary: `Google Trends data unavailable for "${query}".`, credits: r.credits };
  }
  const values = interest.map((p) => p.value ?? 0);
  const max = Math.max(...values);
  const maxIdx = values.indexOf(max);
  const latest = values[values.length - 1] ?? 0;
  const peakDate = interest[maxIdx]?.date || "an earlier period";
  const dropPct = max > 0 ? ((max - latest) / max) * 100 : 0;
  return {
    summary: `Google Trends — search interest for "${query}" over 12 months: peaked at ${max} around ${peakDate}. Current value ${latest} (${dropPct >= 0 ? "down" : "up"} ${Math.abs(dropPct).toFixed(1)}% from peak).`,
    credits: r.credits,
  };
}

// 8. Google Maps reviews — first find the place, then pull reviews
export async function googleMapsReviews(
  query: string
): Promise<{
  reviews: Array<{ rating: number; text: string; date: string; author?: string }>;
  credits: number;
}> {
  const params = new URLSearchParams({ api_key: key(), query });
  const r = await call<{ results?: Array<{ place_id?: string; data_id?: string; reviews?: Array<{ rating?: number; snippet?: string; text?: string; date?: string; user?: { name?: string }; author?: string }> }> }>(
    `${API_BASE}/google_maps?${params}`
  );
  if (!r.ok || !r.data) return { reviews: [], credits: r.credits };
  const place = r.data.results?.[0];
  const reviews = (place?.reviews || []).map((rv) => ({
    rating: typeof rv.rating === "number" ? rv.rating : 0,
    text: rv.snippet || rv.text || "",
    date: rv.date || "",
    author: rv.user?.name || rv.author || undefined,
  }));
  return { reviews, credits: r.credits };
}

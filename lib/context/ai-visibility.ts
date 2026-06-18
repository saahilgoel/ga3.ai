// AI visibility — track how often the workspace's brand AND its detected
// competitors get mentioned in AI-search surfaces (Google AI Mode + ChatGPT)
// for category-relevant prompts. This is the GEO/AI-SEO play: what does
// ChatGPT say when someone asks "best D2C hair brands in India"?
//
// Pipeline:
//   1. Generate 5-8 category prompts (Haiku, from brand + category + competitors)
//   2. For each prompt: query AI Mode + ChatGPT in parallel
//   3. Parse each response with Haiku → {brand, position, recommended}
//   4. Store one row per (prompt × surface) in ai_visibility_runs
//
// Cost per run: 5-8 prompts × (10 + 5 credits) = 75-120 SD credits + Haiku
// usage. Heavy enough to gate behind a manual trigger or weekly cron.

import { trackedModel } from "@/lib/usage/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getDb, getWorkspaceById } from "@/lib/db";
import { getContextStatus } from "./db-helpers";
import { listCompetitors } from "./competitors-db";
import { publish } from "@/lib/pubsub";
import * as sd from "./scrapingdog";

export type StoredRun = {
  id: number;
  prompt_id: number;
  prompt: string;
  surface: "ai_mode" | "chatgpt";
  ran_at: number;
  response_text: string;
  brands: Array<{
    brand: string;
    position: number;
    recommended: boolean;
    sentiment: "positive" | "neutral" | "negative";
    tier: "headline" | "body" | "footnote";
    is_own: boolean;
    is_competitor: boolean;
  }>;
  citations: Array<{
    title: string;
    url: string;
    source: string;
    snippet: string;
  }>;
};

export type RecommendationCard = {
  title: string;
  rationale: string;
  action_items: string[];
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  evidence: string;
};

export type RecommendationsPayload = {
  generated_at: number;
  cards: RecommendationCard[];
};

const PromptListSchema = z.object({
  prompts: z
    .array(
      z.object({
        prompt: z.string().min(12).max(160),
        rationale: z.string().max(160),
      })
    )
    .min(3)
    .max(8),
});

const BrandMentionsSchema = z.object({
  brands: z.array(
    z.object({
      brand: z.string().min(2).max(80),
      position: z.number().int().min(1).max(50),
      recommended: z.boolean(),
      sentiment: z
        .enum(["positive", "neutral", "negative"])
        .describe(
          "Sentiment of how this brand is portrayed — positive when praised/recommended, negative when called out or criticized, neutral when merely listed."
        ),
      tier: z
        .enum(["headline", "body", "footnote"])
        .describe(
          "headline = mentioned in opening / top recommendation; body = somewhere in the middle of the answer; footnote = brief mention at the end or in caveats."
        ),
    })
  ),
});

const RecommendationsSchema = z.object({
  cards: z
    .array(
      z.object({
        title: z.string().min(8).max(80),
        rationale: z
          .string()
          .min(20)
          .max(360)
          .describe("Why this matters, in concrete terms tied to the data."),
        action_items: z
          .array(z.string().min(8).max(160))
          .min(1)
          .max(4)
          .describe("Specific, do-this-tomorrow steps."),
        effort: z.enum(["low", "medium", "high"]),
        impact: z.enum(["low", "medium", "high"]),
        evidence: z
          .string()
          .max(220)
          .describe("Specific data point from the run that supports this card."),
      })
    )
    .min(3)
    .max(7),
});

function publishProgress(
  user_id: number,
  workspace_id: number,
  step: string,
  pct: number,
  status: string
) {
  try {
    publish(user_id, {
      kind: "context.progress",
      workspace_id,
      step,
      pct,
      status,
    });
  } catch {
    // best-effort
  }
}

async function generatePrompts(args: {
  brand_name: string;
  category: string;
  competitor_names: string[];
}): Promise<Array<{ prompt: string; rationale: string }>> {
  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: PromptListSchema,
      prompt: `You're picking 5-7 search-style prompts that real customers might type into ChatGPT or Google AI Search when evaluating brands in the "${args.category}" space. The goal is to find out how often "${args.brand_name}" gets mentioned vs competitors (${args.competitor_names.slice(0, 5).join(", ") || "none detected"}).

Pick prompts that are:
- Buyer-intent ("best", "alternatives to", "vs", "for X use case")
- Not brand-specific (so we discover where the brand IS or ISN'T mentioned)
- Mix of generic category queries and "alternatives to <competitor>" style

For each prompt, include a one-line rationale why it matters.`,
    });
    return object.prompts;
  } catch (err) {
    console.warn("[ai-visibility] prompt generation failed:", (err as Error).message);
    // Static fallback so the pipeline still runs
    return [
      { prompt: `best ${args.category} brands`, rationale: "Generic discovery query" },
      { prompt: `top ${args.category} companies in India`, rationale: "Geo-narrowed" },
      { prompt: `alternatives to ${args.brand_name}`, rationale: "Self-replacement intent" },
    ];
  }
}

type ExtractedBrand = {
  brand: string;
  position: number;
  recommended: boolean;
  sentiment: "positive" | "neutral" | "negative";
  tier: "headline" | "body" | "footnote";
};

async function extractBrands(args: {
  prompt: string;
  response_text: string;
  known_brands: string[];
}): Promise<ExtractedBrand[]> {
  if (!args.response_text || args.response_text.length < 40) return [];
  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: BrandMentionsSchema,
      prompt: `Below is an AI's answer to the prompt "${args.prompt}".

Extract every distinct brand/company name mentioned, in the ORDER they appear. For each, return:
- brand: canonical brand name (no "Inc.", no quotes)
- position: 1-based position in the answer (1 = mentioned first)
- recommended: true if the AI explicitly recommends or top-picks this brand
- sentiment: positive / neutral / negative
- tier: headline (opening / top recs), body (middle), footnote (brief / caveats)

These brands are particularly relevant — match canonical names: ${args.known_brands.join(", ")}

If the answer doesn't list brands, return brands:[].

Answer:
${args.response_text.slice(0, 4500)}`,
    });
    const seen = new Map<string, ExtractedBrand>();
    for (const b of object.brands) {
      const k = b.brand.trim().toLowerCase();
      if (!k) continue;
      if (!seen.has(k) || (seen.get(k)?.position ?? 99) > b.position) {
        seen.set(k, { ...b, brand: b.brand.trim() });
      }
    }
    return [...seen.values()].sort((a, b) => a.position - b.position);
  } catch (err) {
    console.warn(`[ai-visibility] extract failed:`, (err as Error).message);
    return [];
  }
}

export async function runAiVisibility(args: {
  workspace_id: number;
}): Promise<{ prompts: number; runs: number; credits: number }> {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return { prompts: 0, runs: 0, credits: 0 };

  const ctx = getContextStatus(args.workspace_id);
  const brand = ctx?.brand_name;
  if (!brand) {
    console.log(
      `[ai-visibility] ws=${args.workspace_id} skipped — brand not yet detected`
    );
    return { prompts: 0, runs: 0, credits: 0 };
  }
  const category =
    ctx?.industry_category ||
    (brand ? `${brand} category` : "e-commerce");

  const competitors = listCompetitors(args.workspace_id);
  const competitorNames = competitors.map((c) => c.brand_name);
  const knownBrands = [brand, ...competitorNames];

  publishProgress(ws.user_id, ws.id, "AI visibility · generating prompts", 5, "running");

  const db = getDb();
  // Step 1: get or create prompts
  let storedPrompts = db
    .prepare(
      "SELECT * FROM ai_visibility_prompts WHERE workspace_id = ? ORDER BY created_at ASC"
    )
    .all(args.workspace_id) as Array<{
      id: number;
      workspace_id: number;
      prompt: string;
      rationale: string | null;
      created_at: number;
    }>;
  if (storedPrompts.length === 0) {
    const generated = await generatePrompts({
      brand_name: brand,
      category,
      competitor_names: competitorNames,
    });
    for (const g of generated) {
      try {
        db.prepare(
          "INSERT OR IGNORE INTO ai_visibility_prompts (workspace_id, prompt, rationale) VALUES (?, ?, ?)"
        ).run(args.workspace_id, g.prompt, g.rationale);
      } catch (err) {
        console.warn(
          `[ai-visibility] insert prompt failed:`,
          (err as Error).message
        );
      }
    }
    storedPrompts = db
      .prepare(
        "SELECT * FROM ai_visibility_prompts WHERE workspace_id = ? ORDER BY created_at ASC"
      )
      .all(args.workspace_id) as typeof storedPrompts;
  }

  let credits = 0;
  let runs = 0;
  const total = storedPrompts.length * 2;
  let done = 0;
  const tick = (label: string) => {
    done += 1;
    publishProgress(
      ws.user_id,
      ws.id,
      `AI visibility · ${label} (${done}/${total})`,
      5 + Math.round((done / Math.max(1, total)) * 90),
      "running"
    );
  };

  // Step 2: per-prompt parallel AI Mode + ChatGPT
  await Promise.all(
    storedPrompts.flatMap((p) => [
      (async () => {
        try {
          const r = await sd.googleAIOverview(p.prompt, { country: "in" });
          credits += r.credits;
          if (r.text) {
            const brands = await extractBrands({
              prompt: p.prompt,
              response_text: r.text,
              known_brands: knownBrands,
            });
            const annotated = brands.map((b) => ({
              ...b,
              is_own: b.brand.toLowerCase() === brand.toLowerCase(),
              is_competitor: competitorNames.some(
                (c) => c.toLowerCase() === b.brand.toLowerCase()
              ),
            }));
            db.prepare(
              "INSERT INTO ai_visibility_runs (workspace_id, prompt_id, surface, response_text, brands_json, citations_json, credits) VALUES (?, ?, ?, ?, ?, ?, ?)"
            ).run(
              args.workspace_id,
              p.id,
              "ai_mode",
              r.text,
              JSON.stringify(annotated),
              JSON.stringify(r.references ?? []),
              r.credits
            );
            runs += 1;
          }
        } catch (err) {
          console.warn(
            `[ai-visibility] ai_mode "${p.prompt}" failed:`,
            (err as Error).message
          );
        } finally {
          tick("AI Mode");
        }
      })(),
      (async () => {
        try {
          const r = await sd.chatgptAsk(p.prompt);
          credits += r.credits;
          if (r.text) {
            const brands = await extractBrands({
              prompt: p.prompt,
              response_text: r.text,
              known_brands: knownBrands,
            });
            const annotated = brands.map((b) => ({
              ...b,
              is_own: b.brand.toLowerCase() === brand.toLowerCase(),
              is_competitor: competitorNames.some(
                (c) => c.toLowerCase() === b.brand.toLowerCase()
              ),
            }));
            db.prepare(
              "INSERT INTO ai_visibility_runs (workspace_id, prompt_id, surface, response_text, brands_json, citations_json, credits) VALUES (?, ?, ?, ?, ?, ?, ?)"
            ).run(
              args.workspace_id,
              p.id,
              "chatgpt",
              r.text,
              JSON.stringify(annotated),
              JSON.stringify([]), // ChatGPT scraper doesn't expose sources
              r.credits
            );
            runs += 1;
          }
        } catch (err) {
          console.warn(
            `[ai-visibility] chatgpt "${p.prompt}" failed:`,
            (err as Error).message
          );
        } finally {
          tick("ChatGPT");
        }
      })(),
    ])
  );

  publishProgress(ws.user_id, ws.id, `AI visibility · ${runs} runs`, 100, "ready");
  console.log(
    `[ai-visibility] ws=${args.workspace_id} done · ${storedPrompts.length} prompts · ${runs} runs · ${credits} credits`
  );
  return { prompts: storedPrompts.length, runs, credits };
}

export function listLatestRuns(workspaceId: number): StoredRun[] {
  const db = getDb();
  // Latest run per (prompt, surface)
  const rows = db
    .prepare(
      `SELECT r.id, r.prompt_id, r.surface, r.response_text, r.brands_json, r.citations_json, r.ran_at, p.prompt
       FROM ai_visibility_runs r
       JOIN ai_visibility_prompts p ON p.id = r.prompt_id
       WHERE r.workspace_id = ?
         AND r.id IN (
           SELECT MAX(id) FROM ai_visibility_runs
           WHERE workspace_id = ?
           GROUP BY prompt_id, surface
         )
       ORDER BY p.created_at ASC, r.surface ASC`
    )
    .all(workspaceId, workspaceId) as Array<{
      id: number;
      prompt_id: number;
      surface: string;
      response_text: string | null;
      brands_json: string;
      citations_json: string | null;
      ran_at: number;
      prompt: string;
    }>;
  return rows.map((r) => {
    let brands: StoredRun["brands"] = [];
    try {
      brands = JSON.parse(r.brands_json) as StoredRun["brands"];
    } catch {
      brands = [];
    }
    let citations: StoredRun["citations"] = [];
    try {
      citations = r.citations_json ? (JSON.parse(r.citations_json) as StoredRun["citations"]) : [];
    } catch {
      citations = [];
    }
    return {
      id: r.id,
      prompt_id: r.prompt_id,
      prompt: r.prompt,
      surface: r.surface as "ai_mode" | "chatgpt",
      ran_at: r.ran_at,
      response_text: r.response_text || "",
      brands,
      citations,
    };
  });
}

// Princeton-style visibility weight: position (early = better) × tier (headline >
// body > footnote) × recommendation bonus. Normalised to 0..1.
export function visibilityWeight(b: {
  position: number;
  tier?: string;
  recommended?: boolean;
}): number {
  const positionScore = Math.max(0, 1 - (b.position - 1) / 10); // 1 at pos 1, 0 at pos 11+
  const tierMul =
    b.tier === "headline" ? 1.0 : b.tier === "body" ? 0.6 : b.tier === "footnote" ? 0.25 : 0.5;
  const recBonus = b.recommended ? 1.2 : 1.0;
  return Math.min(1, positionScore * tierMul * recBonus);
}

export async function generateRecommendations(args: {
  workspace_id: number;
}): Promise<RecommendationsPayload | null> {
  const ws = getWorkspaceById(args.workspace_id);
  if (!ws) return null;
  const ctx = getContextStatus(args.workspace_id);
  const ownBrand = ctx?.brand_name ?? ws.name;
  const competitors = listCompetitors(args.workspace_id).map((c) => c.brand_name);
  const runs = listLatestRuns(args.workspace_id);
  if (runs.length === 0) return null;

  const lower = (s: string) => s.toLowerCase().trim();
  const ownKey = lower(ownBrand);

  // Build digest for the LLM
  const totals = runs.length;
  let ownMentions = 0;
  let ownRecommended = 0;
  const ownPositions: number[] = [];
  const ownSentiments: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  const competitorMentions = new Map<string, number>();
  const competitorPositions = new Map<string, number[]>();
  const missingPrompts: string[] = [];
  const winningPrompts: string[] = [];
  const losingPrompts: Array<{ prompt: string; surface: string; competitors_above: string[] }> = [];

  for (const r of runs) {
    const ownEntry = r.brands.find((b) => lower(b.brand) === ownKey);
    if (ownEntry) {
      ownMentions += 1;
      ownPositions.push(ownEntry.position);
      ownSentiments[ownEntry.sentiment] = (ownSentiments[ownEntry.sentiment] ?? 0) + 1;
      if (ownEntry.recommended) ownRecommended += 1;
      if (ownEntry.position <= 3) winningPrompts.push(`${r.prompt} [${r.surface}]`);
      else {
        const above = r.brands
          .filter((b) => b.position < ownEntry.position)
          .map((b) => b.brand);
        losingPrompts.push({
          prompt: r.prompt,
          surface: r.surface,
          competitors_above: above,
        });
      }
    } else {
      missingPrompts.push(`${r.prompt} [${r.surface}]`);
    }
    for (const b of r.brands) {
      if (!b.is_competitor) continue;
      const k = lower(b.brand);
      competitorMentions.set(k, (competitorMentions.get(k) ?? 0) + 1);
      const arr = competitorPositions.get(k) ?? [];
      arr.push(b.position);
      competitorPositions.set(k, arr);
    }
  }

  // Citation domain leaderboard (top sources AI Mode cites)
  const domainMentions = new Map<string, number>();
  const domainSnippets = new Map<string, string>();
  for (const r of runs) {
    if (r.surface !== "ai_mode") continue;
    for (const c of r.citations) {
      try {
        const host = new URL(c.url).hostname.replace(/^www\./, "").toLowerCase();
        domainMentions.set(host, (domainMentions.get(host) ?? 0) + 1);
        if (!domainSnippets.has(host) && c.snippet) {
          domainSnippets.set(host, c.snippet.slice(0, 140));
        }
      } catch {
        // bad url
      }
    }
  }
  const topDomains = [...domainMentions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([host, count]) => ({ host, count, sample: domainSnippets.get(host) ?? "" }));

  const ownVisibilityPct = Math.round((ownMentions / Math.max(1, totals)) * 100);
  const competitorRankings = [...competitorMentions.entries()]
    .map(([k, n]) => ({ brand: k, mentions: n, pct: Math.round((n / Math.max(1, totals)) * 100) }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 5);

  const digestText = [
    `Own brand: ${ownBrand}`,
    `Category: ${ctx?.industry_category ?? "—"}`,
    `Tracked prompts × surfaces: ${totals}`,
    `Own brand visibility: ${ownVisibilityPct}% (${ownMentions}/${totals} answers)`,
    `Own brand sentiment mix: pos=${ownSentiments.positive ?? 0} neu=${ownSentiments.neutral ?? 0} neg=${ownSentiments.negative ?? 0}`,
    `Own brand recommended (top-pick): ${ownRecommended}`,
    `Avg position when mentioned: ${ownPositions.length > 0 ? (ownPositions.reduce((s, v) => s + v, 0) / ownPositions.length).toFixed(1) : "—"}`,
    "",
    "Competitor visibility:",
    ...competitorRankings.map(
      (c) => `  - ${c.brand}: ${c.pct}% (${c.mentions} answers)`
    ),
    "",
    "Prompts where own brand is NOT mentioned:",
    ...missingPrompts.slice(0, 12).map((p) => `  - ${p}`),
    "",
    "Prompts where own brand IS mentioned in top 3:",
    ...winningPrompts.slice(0, 8).map((p) => `  - ${p}`),
    "",
    "Prompts where own brand is buried (competitors above):",
    ...losingPrompts.slice(0, 8).map(
      (lp) => `  - "${lp.prompt}" [${lp.surface}] — above us: ${lp.competitors_above.slice(0, 5).join(", ")}`
    ),
    "",
    "Top domains AI Mode cited for these prompts (where the AI gets its info):",
    ...topDomains.map((d) => `  - ${d.host} (${d.count} citations)${d.sample ? " — " + d.sample : ""}`),
    "",
    `Known competitors: ${competitors.join(", ") || "(none)"}`,
  ].join("\n");

  try {
    const { object } = await generateObject({
      model: trackedModel("claude-haiku-4-5-20251001"),
      schema: RecommendationsSchema,
      prompt: `You are a growth/SEO consultant briefing the head of marketing at "${ownBrand}". Based on the AI search visibility report below, write 3-7 SPECIFIC recommendation cards.

Each card must:
- title: punchy headline action (e.g. "Win Reddit threads for [category]", "Pitch G2 review velocity push")
- rationale: 2-3 sentences tying the action to the data (cite actual prompts / competitors / domains)
- action_items: 1-4 concrete steps the team can start tomorrow
- effort: low | medium | high — be honest
- impact: low | medium | high — be honest
- evidence: one specific data point that supports the card (e.g. "Mentioned in only 2/12 answers, never above position 5")

GUIDELINES:
- Be specific. Don't say "improve SEO". Say "publish 3 head-to-head comparison posts targeting 'X vs Y' queries — these surface in 6/12 prompts."
- If a domain appears repeatedly in citations, point at WHERE on that domain to invest.
- If own brand is missing entirely from some prompts, that's the highest-priority gap.
- If sentiment includes negatives, address them.
- Don't recommend the obvious. Surprise the reader with insight.

REPORT:
${digestText}`,
    });
    const payload: RecommendationsPayload = {
      generated_at: Math.floor(Date.now() / 1000),
      cards: object.cards,
    };
    getDb()
      .prepare(
        "INSERT INTO ai_visibility_recommendations (workspace_id, payload_json) VALUES (?, ?)"
      )
      .run(args.workspace_id, JSON.stringify(payload));
    return payload;
  } catch (err) {
    console.warn(
      `[ai-visibility] recommendations failed:`,
      (err as Error).message
    );
    return null;
  }
}

export function latestRecommendations(workspaceId: number): RecommendationsPayload | null {
  const row = getDb()
    .prepare(
      `SELECT payload_json, generated_at FROM ai_visibility_recommendations
       WHERE workspace_id = ?
       ORDER BY generated_at DESC LIMIT 1`
    )
    .get(workspaceId) as { payload_json: string; generated_at: number } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload_json) as RecommendationsPayload;
    return { ...parsed, generated_at: row.generated_at };
  } catch {
    return null;
  }
}

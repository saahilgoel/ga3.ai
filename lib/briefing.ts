import { trackedModel } from "@/lib/usage/anthropic";
import { generateText, generateObject, stepCountIs } from "ai";
import { z } from "zod";
import { AGENTS, Agent } from "./agents";
import { makeGa4Tools } from "./tools";
import type { PropertyWithToken } from "./properties";
import { VISUALIZATION_GUIDANCE } from "./viz";
import { stripEmojis } from "./strip-emojis";

export const InsightSchema = z.object({
  agent: z.string(),
  title: z.string(),
  body: z.string(),
  recommended_action: z.string(),
  impact: z.enum(["high", "medium", "low"]),
});
export type Insight = z.infer<typeof InsightSchema>;

const BRIEFING_TASK = `It is daily briefing time. Run 2-4 GA4 queries from your domain comparing this week (7daysAgo to today) vs the prior week (14daysAgo to 7daysAgo). Look for genuine signals — sharp deltas, mix shifts, segments out of line with the headline.

Surface up to 3 insights from YOUR lens. Each must include:
- title: ≤12 words, declarative, no hedging
- body: 2-3 sentences with specific numbers and the comparison period
- recommended_action: 1 sentence, actionable, the next thing the operator should do
- impact: "high" | "medium" | "low" — high = would change a decision today, medium = worth knowing this week, low = useful context

DO NOT call render_visualization in this task. Just gather data and return JSON.
After your queries, respond with ONLY a single JSON code block in this exact shape:
\`\`\`json
[
  {"title": "...", "body": "...", "recommended_action": "...", "impact": "high"}
]
\`\`\`
No prose outside the code block. If you have no insights, return [].`;

export async function runBriefing(
  withTokens: PropertyWithToken[],
  baseSystem: string
): Promise<Insight[]> {
  // No workspace_id at this call site — briefing is properties-only and doesn't
  // need RAG access. query_context will gracefully return an empty result.
  const tools = makeGa4Tools(withTokens);

  // Skip Vera if Google Ads isn't configured — otherwise her tool calls will
  // error and she'll burn 4 wasted Claude steps before giving up.
  const adsReady = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const agentsToRun = AGENTS.filter((a) => a.id !== "vera" || adsReady);

  const agentResults = await Promise.all(
    agentsToRun.map((agent) => runAgentForBriefing(agent, tools, baseSystem))
  );
  const all: Insight[] = agentResults.flat();

  if (all.length === 0) return [];

  // Moderator pass: rank + dedupe to top 10 (keep Sonnet here — small payload, big quality win).
  try {
    const { object } = await generateObject({
      model: trackedModel("claude-sonnet-4-6", "briefing"),
      schema: z.object({ insights: z.array(InsightSchema).max(10) }),
      system: `You are an editor. You are handed a batch of analytics insights from up to 6 different agents. Your job is to pick the top 10 most actionable and dedupe overlapping items.`,
      prompt: `Here are ${all.length} insights covering acquisition (maya), funnel (arjun), retention (priya), audience (kabir), devil's-advocate (raavi), and budget/paid (vera):

${JSON.stringify(all, null, 2)}

Pick the top 10 by genuine actionability + impact. Rules:
- Drop near-duplicates (same finding from two agents — keep the sharper version).
- Rank high-impact items above medium above low.
- Keep at most 3 from any single agent — diversity matters.
- Preserve the "agent" field exactly as given so the UI can color-code.
Return as JSON: { "insights": [...] }`,
    });
    return object.insights;
  } catch {
    // If moderator fails, return the raw set capped to 10, prioritizing high impact.
    const impactRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...all]
      .sort((a, b) => impactRank[a.impact] - impactRank[b.impact])
      .slice(0, 10);
  }
}

async function runAgentForBriefing(
  agent: Agent,
  // Tools shape comes from makeGa4Tools — type intentionally inferred.
  tools: ReturnType<typeof makeGa4Tools>,
  baseSystem: string
): Promise<Insight[]> {
  const system = `${baseSystem}

VISUALIZATION:
${VISUALIZATION_GUIDANCE}

PERSONA: ${agent.systemPromptAddendum}

BRIEFING TASK:
${BRIEFING_TASK}`;

  try {
    // Per-agent passes use Haiku 4.5 — ~5x faster than Sonnet, materially
    // cheaper, and quality is fine because the moderator re-ranks afterwards.
    const { text } = await generateText({
      model: trackedModel("claude-haiku-4-5-20251001", "briefing"),
      system,
      prompt: "Generate your daily-briefing insights now. Run your queries and return JSON.",
      tools,
      stopWhen: stepCountIs(4),
    });
    const parsed = extractInsightArray(text);
    return parsed.map((p) => ({
      ...p,
      title: stripEmojis(p.title),
      body: stripEmojis(p.body),
      recommended_action: stripEmojis(p.recommended_action),
      agent: agent.id,
    }));
  } catch {
    return [];
  }
}

const RawInsightSchema = z.object({
  title: z.string(),
  body: z.string(),
  recommended_action: z.string(),
  impact: z.enum(["high", "medium", "low"]),
});
type RawInsight = z.infer<typeof RawInsightSchema>;

function extractInsightArray(text: string): RawInsight[] {
  const candidates: string[] = [];
  const block = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (block) candidates.push(block[1]);
  const arrMatch = text.match(/\[\s*\{[\s\S]+?\}\s*\]/);
  if (arrMatch) candidates.push(arrMatch[0]);
  candidates.push(text);

  for (const c of candidates) {
    try {
      const arr = JSON.parse(c);
      if (!Array.isArray(arr)) continue;
      const valid: RawInsight[] = [];
      for (const item of arr) {
        const r = RawInsightSchema.safeParse(item);
        if (r.success) valid.push(r.data);
      }
      if (valid.length > 0) return valid;
    } catch {
      // try next
    }
  }
  return [];
}

// In-memory 6-hour cache keyed by (user_ids|active_property_ids)
type CacheEntry = { insights: Insight[]; expires_at: number; generated_at: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function getCachedBriefing(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires_at) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedBriefing(key: string, insights: Insight[]): CacheEntry {
  const entry: CacheEntry = {
    insights,
    generated_at: Date.now(),
    expires_at: Date.now() + CACHE_TTL_MS,
  };
  cache.set(key, entry);
  return entry;
}

export function briefingCacheKey(userIds: number[], propertyIds: number[]): string {
  return `${[...userIds].sort().join(",")}|${[...propertyIds].sort().join(",")}`;
}

export function clearBriefingCache(key: string) {
  cache.delete(key);
}

import { trackedModel } from "@/lib/usage/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

export const siteProfileSchema = z.object({
  business: z.string().describe("4-6 sentences: what this business/site is."),
  category: z
    .string()
    .describe(
      "A specific market category usable to find direct competitors, e.g. 'D2C skincare brand', 'online grocery delivery app', 'B2B freight SaaS', 'fashion marketplace'. Base this ONLY on what THIS site actually sells/does — NOT on any parent company, and NOT on the logistics/payment/SaaS vendors it merely uses."
    ),
  audience: z.string().describe("4-6 sentences: who it serves."),
  key_conversions: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 conversion events that likely matter on this site"),
  starter_questions: z
    .array(z.string())
    .min(3)
    .max(3)
    .describe("Exactly 3 high-value questions the owner would want answered about their traffic"),
});

export type SiteProfile = z.infer<typeof siteProfileSchema>;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHomepage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 ga-chat-bot" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    return stripTags(html).slice(0, 8000);
  } catch {
    return null;
  }
}

export async function generateSiteProfile(args: {
  url: string;
  displayName: string;
  html?: string | null;
}): Promise<SiteProfile> {
  // Prefer already-rendered HTML (e.g. the orchestrator's JS-rendered crawl) —
  // a plain fetch returns almost nothing for SPA sites, which wrecks category
  // detection. Fall back to a direct fetch when no HTML is supplied.
  const cleaned = args.html ? stripTags(args.html).slice(0, 8000) : await fetchHomepage(args.url);

  const fallbackPrompt = `You only have the GA4 property display name and URL — the homepage couldn't be fetched. Make a best-effort profile.

Display name: ${args.displayName}
URL: ${args.url}`;

  const richPrompt = `Here is the homepage of ${args.url} (display name: ${args.displayName}).

Homepage text (truncated):
"""
${cleaned}
"""

Describe:
- business: (4-6 sentences) what this business/site is
- category: a specific market category usable to find direct competitors (e.g. "D2C skincare brand", "online grocery delivery app", "fashion marketplace"). Base it ONLY on what THIS site sells/does — NOT a parent company, NOT the logistics/payment/SaaS vendors it merely uses.
- audience: (4-6 sentences) who it serves
- key_conversions: 3-5 conversion events that likely matter (e.g. "signup", "add_to_cart", "contact_form_submit")
- starter_questions: 3 high-value questions the owner would want answered about their traffic

Be specific to THIS site, not generic.`;

  const prompt = cleaned ? richPrompt : fallbackPrompt;

  try {
    const { object } = await generateObject({
      model: trackedModel("claude-sonnet-4-6"),
      schema: siteProfileSchema,
      prompt,
    });
    return object;
  } catch {
    return {
      business: `${args.displayName} (${args.url}) — site profile could not be auto-generated. The chat will still work; describe your business in the first message for better answers.`,
      category: "",
      audience: "Unknown — please describe your audience in chat.",
      key_conversions: ["page_view", "session_start", "user_engagement"],
      starter_questions: [
        "What were my top traffic sources last week?",
        "Which landing pages have the highest engagement?",
        "How many users came from organic search this month?",
      ],
    };
  }
}

import { generateObject } from "ai";
import { z } from "zod";
import { runReport } from "@/lib/ga4";
import { trackedModel } from "@/lib/usage/anthropic";
import type { SiteProfile } from "@/lib/profile";

// What GA3 decides a connected property *is* — drives which dashboard it builds.
export const BUSINESS_TYPES = [
  "ecommerce",
  "saas",
  "content",
  "leadgen",
  "marketplace",
  "other",
] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  ecommerce: "D2C / ecommerce",
  saas: "SaaS / product",
  content: "content / media",
  leadgen: "lead generation",
  marketplace: "marketplace",
  other: "general website",
};

// The analytical lens each type cares about — fed to the insight/hook prompt so
// the headline speaks the owner's language (revenue vs retention vs readership).
export const BUSINESS_TYPE_LENS: Record<BusinessType, string> = {
  ecommerce:
    "revenue, conversion rate, AOV, checkout funnel drop-off, new-vs-returning revenue",
  saas: "activation, signups, active users (DAU/WAU/MAU), retention, churn risk",
  content: "engaged sessions, returning readers, read-depth, top content, traffic quality",
  leadgen: "qualified leads, form/enquiry conversion, cost per lead by channel",
  marketplace: "supply vs demand activity, liquidity, repeat usage on both sides",
  other: "engagement, conversions, and the highest-leverage traffic sources",
};

/** Top GA4 event names a property actually fires (last 90 days). */
export async function topEventNames(
  accessToken: string,
  propertyId: string
): Promise<string[]> {
  try {
    const r = await runReport(accessToken, propertyId, {
      dimensions: ["eventName"],
      metrics: ["eventCount"],
      startDate: "90daysAgo",
      endDate: "today",
      limit: 60,
      orderBy: { metric: "eventCount", desc: true },
    });
    return (r.rows as Array<Record<string, unknown>>)
      .map((row) => String(row.eventName ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// Plain-language summary of the event taxonomy — a strong prior the model
// confirms or overrides using the site context.
function eventSignal(events: string[]): string {
  const has = (e: string) => events.includes(e);
  const sig: string[] = [];
  if (has("purchase") || has("add_to_cart") || has("begin_checkout") || has("view_item"))
    sig.push("ecommerce events present (purchase / add_to_cart / begin_checkout / view_item)");
  if (has("sign_up") || has("login") || has("subscribe") || has("trial_start"))
    sig.push("product/SaaS events present (sign_up / login / subscribe / trial_start)");
  if (has("generate_lead") || has("form_submit") || has("form_start") || has("contact"))
    sig.push("lead-gen events present (generate_lead / form_submit / contact)");
  if (has("video_start") || has("scroll") || has("article_view"))
    sig.push("content engagement events present (video_start / scroll / article_view)");
  return sig.length ? sig.join("; ") : "no strong commerce/product event signals";
}

const SCHEMA = z.object({
  business_type: z.enum(BUSINESS_TYPES),
  confidence: z.number().min(0).max(100),
  rationale: z.string().max(280),
});
export type Classification = z.infer<typeof SCHEMA>;

/**
 * Decide what kind of business a connected GA4 property is, from its real event
 * taxonomy + the scraped site profile. This is the north-star input that lets
 * the dashboard tailor itself to the owner.
 */
export async function classifyBusiness(args: {
  accessToken: string;
  propertyId: string;
  siteProfile?: SiteProfile | null;
}): Promise<Classification> {
  const events = await topEventNames(args.accessToken, args.propertyId);
  const p = args.siteProfile;
  const prompt = `Classify this business into exactly ONE type for an analytics dashboard.

Types:
- ecommerce: sells products online (D2C / retail); revenue comes from orders.
- saas: software product or app; value from signups / subscriptions / usage.
- content: media / blog / publisher; value from readership and engagement.
- leadgen: generates leads or enquiries (services, B2B, real estate, finance).
- marketplace: connects buyers and sellers / multi-sided platform.
- other: none of the above clearly applies.

Website category: ${p?.category ?? "unknown"}
What the business does: ${p?.business ?? "unknown"}
Key conversions they care about: ${(p?.key_conversions ?? []).join(", ") || "unknown"}
GA4 events fired (top, last 90d): ${events.slice(0, 30).join(", ") || "none detected"}
Event signal: ${eventSignal(events)}

Weigh the real GA4 events heavily — they reflect what actually happens on the
site. Pick the single best type. confidence 0-100. rationale: one short sentence.`;

  const { object } = await generateObject({
    model: trackedModel("claude-haiku-4-5-20251001", "classify"),
    schema: SCHEMA,
    prompt,
  });
  return object;
}

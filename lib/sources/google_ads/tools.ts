// Agent tools for Google Ads. Returned as a plain object so chat/brief/scan
// call sites can spread them alongside makeGa4Tools().

import { tool } from "ai";
import { z } from "zod";
import { runGaql, isGoogleAdsConfigured } from "./api";
import { runReport } from "@/lib/ga4";
import type { PropertyWithToken } from "@/lib/properties";

export type AdsAttachment = {
  customer_id: string;
  display_name: string;
  account_email: string;
};

export type AdsToolsCtx = {
  userId: number;
  adsCustomers: AdsAttachment[];
  // GA4 hookup for the cross-platform tool
  ga4Active: PropertyWithToken[];
};

export function makeGoogleAdsTools(ctx: AdsToolsCtx) {
  if (!isGoogleAdsConfigured() || ctx.adsCustomers.length === 0) {
    return {} as Record<string, never>;
  }
  const primaryCustomer = ctx.adsCustomers[0];

  return {
    run_google_ads_report: tool({
      description: `Run a Google Ads report using GAQL. Use this for any question about ad spend, campaign performance, keywords, ad creatives, or paid-media metrics.

GAQL examples:
- Campaign performance: SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING LAST_7_DAYS
- Search terms: SELECT search_term_view.search_term, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS
- Ad performance: SELECT ad_group_ad.ad.id, metrics.impressions, metrics.ctr FROM ad_group_ad WHERE segments.date DURING LAST_7_DAYS

Notes:
- Costs are in micros — always divide cost_micros by 1,000,000 in your interpretation.
- Date ranges: LAST_7_DAYS, LAST_14_DAYS, LAST_30_DAYS, THIS_MONTH, LAST_MONTH, or explicit dates ("BETWEEN 2026-05-01 AND 2026-05-31").
- Common metrics: cost_micros, clicks, impressions, conversions, conversions_value, ctr, average_cpc.
- Common dimensions: campaign.name, ad_group.name, keyword_view.keyword.text, search_term_view.search_term.`,
      inputSchema: z.object({
        gaql: z.string().describe("Full GAQL query"),
        customer_id: z
          .string()
          .optional()
          .describe(
            "Optional — specific Ads customer ID to query. Defaults to the first attached customer."
          ),
      }),
      execute: async ({ gaql, customer_id }) => {
        try {
          const cid = customer_id || primaryCustomer.customer_id;
          const rows = await runGaql({
            userId: ctx.userId,
            customerId: cid,
            query: gaql,
          });
          return { customer_id: cid, rows };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),

    get_google_ads_overview: tool({
      description: `Quick first-pass overview of paid performance across all attached Google Ads customers. Returns total spend (₹), clicks, conversions, and average CPC for the chosen window. Use this when the user asks "how's my paid doing" — before diving into specifics with run_google_ads_report.`,
      inputSchema: z.object({
        date_range: z
          .enum(["LAST_7_DAYS", "LAST_14_DAYS", "LAST_30_DAYS", "THIS_MONTH", "LAST_MONTH"])
          .default("LAST_7_DAYS"),
      }),
      execute: async ({ date_range }) => {
        try {
          const perCustomer = await Promise.all(
            ctx.adsCustomers.map(async (c) => {
              try {
                const rows = (await runGaql({
                  userId: ctx.userId,
                  customerId: c.customer_id,
                  query: `SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM customer WHERE segments.date DURING ${date_range}`,
                })) as Array<{
                  metrics?: {
                    cost_micros?: string | number;
                    clicks?: string | number;
                    impressions?: string | number;
                    conversions?: string | number;
                  };
                }>;
                const m = rows[0]?.metrics ?? {};
                return {
                  customer_id: c.customer_id,
                  display_name: c.display_name,
                  spend: Number(m.cost_micros || 0) / 1_000_000,
                  clicks: Number(m.clicks || 0),
                  impressions: Number(m.impressions || 0),
                  conversions: Number(m.conversions || 0),
                };
              } catch (err) {
                return {
                  customer_id: c.customer_id,
                  display_name: c.display_name,
                  error: (err as Error).message,
                };
              }
            })
          );
          const totals = perCustomer.reduce(
            (acc, p) =>
              "error" in p
                ? acc
                : {
                    spend: acc.spend + p.spend,
                    clicks: acc.clicks + p.clicks,
                    impressions: acc.impressions + p.impressions,
                    conversions: acc.conversions + p.conversions,
                  },
            { spend: 0, clicks: 0, impressions: 0, conversions: 0 }
          );
          const avgCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
          return {
            date_range,
            totals: { ...totals, avg_cpc: avgCpc },
            per_customer: perCustomer,
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),

    compare_spend_to_conversions: tool({
      description: `THE cross-platform tool. Joins Google Ads spend to GA4 conversion outcomes by campaign name (UTM-matched). This is the analysis neither GA4 nor Google Ads can produce alone.

Use this when:
- User asks about real ROI, ROAS, CAC, cost per conversion
- Comparing efficiency across campaigns
- Auditing whether paid spend drives real outcomes vs vanity clicks
- Identifying attribution gaps between Ads-reported and GA4-attributed conversions

Output per campaign:
- spend (₹), ads_reported_conversions, ga4_attributed_conversions, attribution_gap_pct (Ads vs GA4 — Ads almost always shows more due to view-through), sessions, real CAC (spend / GA4 conversions), blended ROAS (GA4 revenue / spend), cost_per_session.

Ads-reported and GA4-attributed will rarely match — that gap is itself the signal.`,
      inputSchema: z.object({
        date_range_days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(7)
          .describe("Last N days. 7 (default), 14, 30, 90."),
        campaign_filter: z
          .string()
          .optional()
          .describe("Optional substring filter on campaign name (case-insensitive)."),
      }),
      execute: async ({ date_range_days, campaign_filter }) => {
        try {
          if (ctx.ga4Active.length === 0) {
            return { error: "no_ga4_attached" };
          }
          const adsRange =
            date_range_days <= 7
              ? "LAST_7_DAYS"
              : date_range_days <= 14
              ? "LAST_14_DAYS"
              : date_range_days <= 30
              ? "LAST_30_DAYS"
              : "LAST_30_DAYS"; // GAQL doesn't have LAST_90_DAYS — use absolute
          const gaqlPromise = Promise.all(
            ctx.adsCustomers.map(async (c) => {
              const rows = (await runGaql({
                userId: ctx.userId,
                customerId: c.customer_id,
                query: `SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING ${adsRange}`,
              })) as Array<{
                campaign?: { name?: string };
                metrics?: {
                  cost_micros?: string | number;
                  clicks?: string | number;
                  conversions?: string | number;
                  conversions_value?: string | number;
                };
              }>;
              return rows.map((r) => ({
                customer_id: c.customer_id,
                campaign: r.campaign?.name || "(unnamed)",
                spend: Number(r.metrics?.cost_micros || 0) / 1_000_000,
                clicks: Number(r.metrics?.clicks || 0),
                ads_conversions: Number(r.metrics?.conversions || 0),
                ads_value: Number(r.metrics?.conversions_value || 0),
              }));
            })
          );

          const first = ctx.ga4Active[0];
          const ga4Promise = (async () => {
            try {
              return await runReport(first.accessToken, first.property.ga4_property_id, {
                dimensions: ["sessionCampaignName"],
                metrics: ["sessions", "keyEvents", "totalRevenue"],
                startDate: `${date_range_days}daysAgo`,
                endDate: "yesterday",
                limit: 200,
              });
            } catch {
              return await runReport(first.accessToken, first.property.ga4_property_id, {
                dimensions: ["sessionCampaignName"],
                metrics: ["sessions", "conversions", "totalRevenue"],
                startDate: `${date_range_days}daysAgo`,
                endDate: "yesterday",
                limit: 200,
              });
            }
          })();

          const [adsAll, ga4] = await Promise.all([gaqlPromise, ga4Promise]);
          const adsFlat = adsAll.flat();

          // Build GA4 lookup
          const ga4By = new Map<string, { sessions: number; conv: number; rev: number }>();
          for (const r of ga4.rows) {
            const name = (r.dimensions.sessionCampaignName || "(unset)").toLowerCase();
            const conv =
              Number(r.metrics.keyEvents || 0) || Number(r.metrics.conversions || 0);
            const cur =
              ga4By.get(name) ?? { sessions: 0, conv: 0, rev: 0 };
            cur.sessions += Number(r.metrics.sessions || 0);
            cur.conv += conv;
            cur.rev += Number(r.metrics.totalRevenue || 0);
            ga4By.set(name, cur);
          }

          const filter = (campaign_filter || "").toLowerCase().trim();
          const merged = adsFlat
            .filter((a) => !filter || a.campaign.toLowerCase().includes(filter))
            .map((a) => {
              const g = ga4By.get(a.campaign.toLowerCase()) ?? {
                sessions: 0,
                conv: 0,
                rev: 0,
              };
              const gap =
                a.ads_conversions > 0
                  ? ((a.ads_conversions - g.conv) / a.ads_conversions) * 100
                  : 0;
              return {
                campaign: a.campaign,
                customer_id: a.customer_id,
                spend: round(a.spend, 2),
                clicks: a.clicks,
                ads_reported_conversions: a.ads_conversions,
                ga4_attributed_conversions: g.conv,
                attribution_gap_pct: round(gap, 1),
                ga4_sessions: g.sessions,
                ga4_revenue: round(g.rev, 2),
                real_cac: g.conv > 0 ? round(a.spend / g.conv, 2) : null,
                blended_roas: a.spend > 0 ? round(g.rev / a.spend, 2) : null,
                cost_per_session: g.sessions > 0 ? round(a.spend / g.sessions, 2) : null,
              };
            })
            .sort((a, b) => b.spend - a.spend);

          return {
            date_range_days,
            ads_customers: ctx.adsCustomers.map((c) => c.customer_id),
            campaigns: merged,
            totals: {
              total_spend: round(adsFlat.reduce((s, a) => s + a.spend, 0), 2),
              ads_reported_conversions: adsFlat.reduce((s, a) => s + a.ads_conversions, 0),
              ga4_attributed_conversions: merged.reduce(
                (s, c) => s + c.ga4_attributed_conversions,
                0
              ),
            },
          };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),
  };
}

function round(n: number, places: number): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

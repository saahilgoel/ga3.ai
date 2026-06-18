// Agent tools for MoEngage. Returned as an object so chat/brief/scan call
// sites can spread them alongside the other source tools.

import { tool } from "ai";
import { z } from "zod";
import {
  getCampaignStats,
  getSegmentCount,
  isMoEngageConfigured,
  listMoEngageCampaigns,
} from "./api";
import { runReport } from "@/lib/ga4";
import type { PropertyWithToken } from "@/lib/properties";

export type MoEngageToolsCtx = {
  userId: number;
  // True when the workspace has at least one moengage source attached.
  attached: boolean;
  ga4Active: PropertyWithToken[];
};

export function makeMoEngageTools(ctx: MoEngageToolsCtx) {
  if (!isMoEngageConfigured(ctx.userId) || !ctx.attached) {
    return {} as Record<string, never>;
  }

  return {
    list_moengage_campaigns: tool({
      description: `List all campaigns from MoEngage. Use this first when the user asks about messaging performance — gets you campaign IDs you can then pull stats for.

Returns: campaign_id, name, channel (push / email / sms / in_app / web_push), status, start/end times. Limit 50 by default.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).optional().default(50),
      }),
      execute: async ({ limit }) => {
        try {
          const campaigns = await listMoEngageCampaigns({
            userId: ctx.userId,
            limit,
          });
          return { campaigns };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),

    get_moengage_campaign_stats: tool({
      description: `Pull stats for a single MoEngage campaign over a date range. Returns sent / delivered / opened / clicked / converted / unsubscribed.

Get the campaign_id first via list_moengage_campaigns. Dates in YYYY-MM-DD.`,
      inputSchema: z.object({
        campaign_id: z.string(),
        start_date: z.string().describe("YYYY-MM-DD"),
        end_date: z.string().describe("YYYY-MM-DD"),
      }),
      execute: async ({ campaign_id, start_date, end_date }) => {
        try {
          const stats = await getCampaignStats({
            userId: ctx.userId,
            campaignId: campaign_id,
            startDate: start_date,
            endDate: end_date,
          });
          return { stats };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),

    get_moengage_segment_count: tool({
      description:
        "Get the user count of a MoEngage segment by segment ID. Use when comparing audience sizes across segments or before recommending a campaign.",
      inputSchema: z.object({ segment_id: z.string() }),
      execute: async ({ segment_id }) => {
        try {
          const count = await getSegmentCount({
            userId: ctx.userId,
            segmentId: segment_id,
          });
          return { segment_id, count };
        } catch (err) {
          return { error: (err as Error).message };
        }
      },
    }),

    compare_engagement_to_outcomes: tool({
      description: `The cross-platform tool. For each MoEngage campaign, join its sends/opens to GA4's sessions + conversions for the matching UTM. Surfaces:
  - which engagement campaigns are actually driving sessions vs. just opens
  - "click-to-conversion" gap (high opens, low conversions = creative or destination problem)
  - dead campaigns: high sent, near-zero downstream

Match key: MoEngage campaign name === GA4 sessionCampaignName (assuming UTM tagging discipline).`,
      inputSchema: z.object({
        date_range_days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(14)
          .describe("Last N days"),
      }),
      execute: async ({ date_range_days }) => {
        try {
          if (ctx.ga4Active.length === 0) {
            return { error: "no_ga4_attached" };
          }
          const end = new Date();
          const start = new Date(end);
          start.setDate(start.getDate() - date_range_days);
          const fmt = (d: Date) => d.toISOString().slice(0, 10);

          const campaigns = await listMoEngageCampaigns({
            userId: ctx.userId,
            limit: 100,
          });

          // Pull stats per campaign in parallel (capped at 25 to avoid rate limits).
          const top = campaigns.slice(0, 25);
          const stats = await Promise.all(
            top.map(async (c) => {
              try {
                const s = await getCampaignStats({
                  userId: ctx.userId,
                  campaignId: c.campaign_id,
                  startDate: fmt(start),
                  endDate: fmt(end),
                });
                return s;
              } catch {
                return null;
              }
            })
          );

          // GA4 side: sessionCampaignName × sessions + keyEvents + totalRevenue
          const first = ctx.ga4Active[0];
          let ga4;
          try {
            ga4 = await runReport(first.accessToken, first.property.ga4_property_id, {
              dimensions: ["sessionCampaignName"],
              metrics: ["sessions", "keyEvents", "totalRevenue"],
              startDate: `${date_range_days}daysAgo`,
              endDate: "yesterday",
              limit: 500,
            });
          } catch {
            ga4 = await runReport(first.accessToken, first.property.ga4_property_id, {
              dimensions: ["sessionCampaignName"],
              metrics: ["sessions", "conversions", "totalRevenue"],
              startDate: `${date_range_days}daysAgo`,
              endDate: "yesterday",
              limit: 500,
            });
          }
          const ga4By = new Map<
            string,
            { sessions: number; conv: number; rev: number }
          >();
          for (const r of ga4.rows) {
            const key = (r.dimensions.sessionCampaignName || "").toLowerCase();
            const conv =
              Number(r.metrics.keyEvents || 0) ||
              Number(r.metrics.conversions || 0);
            const cur = ga4By.get(key) ?? { sessions: 0, conv: 0, rev: 0 };
            cur.sessions += Number(r.metrics.sessions || 0);
            cur.conv += conv;
            cur.rev += Number(r.metrics.totalRevenue || 0);
            ga4By.set(key, cur);
          }

          // Join
          const merged = stats
            .filter((s): s is NonNullable<typeof s> => !!s)
            .map((s) => {
              const ga = ga4By.get(s.name.toLowerCase()) ?? {
                sessions: 0,
                conv: 0,
                rev: 0,
              };
              const openRate = s.sent > 0 ? (s.opened / s.sent) * 100 : 0;
              const ctr = s.opened > 0 ? (s.clicked / s.opened) * 100 : 0;
              const click_to_conv =
                s.clicked > 0 ? (ga.conv / s.clicked) * 100 : 0;
              return {
                campaign: s.name,
                channel: s.channel,
                sent: s.sent,
                delivered: s.delivered,
                opened: s.opened,
                clicked: s.clicked,
                moengage_converted: s.converted,
                ga4_sessions: ga.sessions,
                ga4_conversions: ga.conv,
                ga4_revenue: Math.round(ga.rev * 100) / 100,
                open_rate_pct: round(openRate, 1),
                ctr_pct: round(ctr, 1),
                click_to_conv_pct: round(click_to_conv, 1),
              };
            })
            .sort((a, b) => b.sent - a.sent);

          return {
            date_range_days,
            campaigns: merged,
            totals: {
              total_sent: merged.reduce((s, c) => s + c.sent, 0),
              total_ga4_sessions: merged.reduce((s, c) => s + c.ga4_sessions, 0),
              total_ga4_conversions: merged.reduce(
                (s, c) => s + c.ga4_conversions,
                0
              ),
              total_ga4_revenue: round(
                merged.reduce((s, c) => s + c.ga4_revenue, 0),
                2
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

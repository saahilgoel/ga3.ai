import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import {
  resolveActiveWorkspace,
} from "@/lib/workspace";
import { workspaceAdsCustomers } from "@/lib/workspace";
import { isGoogleAdsConfigured, runGaql } from "@/lib/sources/google_ads/api";
import {
  resolvePreset,
  type RangePreset,
} from "@/lib/dashboard";

// Maps our preset → GAQL date_range constant.
function toGaqlRange(preset: RangePreset): string {
  switch (preset) {
    case "today":
    case "yesterday":
      return "LAST_7_DAYS"; // single-day windows not always reliable in GAQL — clamp
    case "last_7_days":
      return "LAST_7_DAYS";
    case "last_28_days":
      return "LAST_30_DAYS";
    case "last_90_days":
      return "LAST_30_DAYS"; // GAQL has no LAST_90_DAYS shorthand
    case "month_to_date":
      return "THIS_MONTH";
    default:
      return "LAST_7_DAYS";
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ error: "no_active_workspace" }, { status: 400 });
  }
  if (!isGoogleAdsConfigured(ws.user_id)) {
    return NextResponse.json({
      configured: false,
      attached: false,
      hint: "Google Ads developer token not set — paste yours in the Connect Google Ads wizard.",
    });
  }
  const ads = workspaceAdsCustomers(ws);
  if (ads.length === 0) {
    return NextResponse.json({ configured: true, attached: false });
  }
  const body = (await req.json().catch(() => ({}))) as {
    range_preset?: RangePreset;
  };
  const preset = body.range_preset ?? "last_7_days";
  const range = resolvePreset(preset);
  const gaqlRange = toGaqlRange(preset);

  try {
    // Headline metrics (sum across attached customers)
    const headlineRows = await Promise.all(
      ads.map(async (c) => {
        try {
          const r = (await runGaql({
            userId: ws.user_id,
            customerId: c.source_id,
            query: `SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM customer WHERE segments.date DURING ${gaqlRange}`,
          })) as Array<{
            metrics?: {
              cost_micros?: string | number;
              clicks?: string | number;
              impressions?: string | number;
              conversions?: string | number;
            };
          }>;
          const m = r[0]?.metrics ?? {};
          return {
            spend: Number(m.cost_micros || 0) / 1_000_000,
            clicks: Number(m.clicks || 0),
            impressions: Number(m.impressions || 0),
            conversions: Number(m.conversions || 0),
          };
        } catch {
          return { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
        }
      })
    );
    const totals = headlineRows.reduce(
      (acc, r) => ({
        spend: acc.spend + r.spend,
        clicks: acc.clicks + r.clicks,
        impressions: acc.impressions + r.impressions,
        conversions: acc.conversions + r.conversions,
      }),
      { spend: 0, clicks: 0, impressions: 0, conversions: 0 }
    );
    const avg_cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;

    // Top campaigns by spend
    type CampaignRow = {
      campaign: string;
      customer_id: string;
      spend: number;
      clicks: number;
      conversions: number;
    };
    const allCampaigns: CampaignRow[] = [];
    await Promise.all(
      ads.map(async (c) => {
        try {
          const r = (await runGaql({
            userId: ws.user_id,
            customerId: c.source_id,
            query: `SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date DURING ${gaqlRange} ORDER BY metrics.cost_micros DESC LIMIT 30`,
          })) as Array<{
            campaign?: { name?: string };
            metrics?: {
              cost_micros?: string | number;
              clicks?: string | number;
              conversions?: string | number;
            };
          }>;
          for (const row of r) {
            allCampaigns.push({
              campaign: row.campaign?.name || "(unnamed)",
              customer_id: c.source_id,
              spend: Number(row.metrics?.cost_micros || 0) / 1_000_000,
              clicks: Number(row.metrics?.clicks || 0),
              conversions: Number(row.metrics?.conversions || 0),
            });
          }
        } catch {
          /* skip this customer */
        }
      })
    );
    allCampaigns.sort((a, b) => b.spend - a.spend);

    return NextResponse.json({
      configured: true,
      attached: true,
      range,
      gaql_range: gaqlRange,
      ads_customers: ads.map((c) => ({ id: c.source_id, name: c.display_name })),
      totals: { ...totals, avg_cpc },
      top_campaigns: allCampaigns.slice(0, 8),
    });
  } catch (err) {
    return NextResponse.json(
      { configured: true, attached: true, error: (err as Error).message },
      { status: 500 }
    );
  }
}

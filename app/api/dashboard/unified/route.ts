import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import {
  resolveActiveWorkspace,
  resolveWorkspaceWithTokens,
  workspaceAdsCustomers,
} from "@/lib/workspace";
import { runReport } from "@/lib/ga4";
import { isGoogleAdsConfigured, runGaql } from "@/lib/sources/google_ads/api";
import {
  resolvePreset,
  type RangePreset,
} from "@/lib/dashboard";

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
    return NextResponse.json({ configured: false });
  }
  const ads = workspaceAdsCustomers(ws);
  if (ads.length === 0) {
    return NextResponse.json({ configured: true, attached: false });
  }
  const wt = await resolveWorkspaceWithTokens(ws);
  if (wt.properties.length === 0) {
    return NextResponse.json({ configured: true, attached: true, no_ga4: true });
  }

  const body = (await req.json().catch(() => ({}))) as {
    range_preset?: RangePreset;
  };
  const preset: RangePreset = body.range_preset ?? "last_7_days";
  const range = resolvePreset(preset);
  const days = Math.max(
    1,
    Math.round((new Date(range.end).getTime() - new Date(range.start).getTime()) / 86_400_000) + 1
  );

  try {
    // Ads: per-campaign spend + ads-reported conversions
    const adsRange =
      days <= 7
        ? "LAST_7_DAYS"
        : days <= 14
        ? "LAST_14_DAYS"
        : "LAST_30_DAYS";
    type AdsCampaign = {
      campaign: string;
      spend: number;
      ads_conversions: number;
      conv_value: number;
    };
    const adsByCampaign = new Map<string, AdsCampaign>();
    await Promise.all(
      ads.map(async (c) => {
        try {
          const r = (await runGaql({
            userId: ws.user_id,
            customerId: c.source_id,
            query: `SELECT campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING ${adsRange}`,
          })) as Array<{
            campaign?: { name?: string };
            metrics?: {
              cost_micros?: string | number;
              conversions?: string | number;
              conversions_value?: string | number;
            };
          }>;
          for (const row of r) {
            const name = row.campaign?.name || "(unnamed)";
            const key = name.toLowerCase();
            const existing = adsByCampaign.get(key) ?? {
              campaign: name,
              spend: 0,
              ads_conversions: 0,
              conv_value: 0,
            };
            existing.spend += Number(row.metrics?.cost_micros || 0) / 1_000_000;
            existing.ads_conversions += Number(row.metrics?.conversions || 0);
            existing.conv_value += Number(row.metrics?.conversions_value || 0);
            adsByCampaign.set(key, existing);
          }
        } catch {
          /* skip */
        }
      })
    );

    // GA4: per-campaign sessions + conversions + revenue
    const first = wt.properties[0];
    async function pullGa4(metrics: string[]) {
      return runReport(first.accessToken, first.property.ga4_property_id, {
        dimensions: ["sessionCampaignName"],
        metrics,
        startDate: `${days}daysAgo`,
        endDate: "yesterday",
        limit: 500,
      });
    }
    let ga4;
    try {
      ga4 = await pullGa4(["sessions", "keyEvents", "totalRevenue"]);
    } catch {
      ga4 = await pullGa4(["sessions", "conversions", "totalRevenue"]);
    }
    const ga4By = new Map<string, { sessions: number; conv: number; rev: number }>();
    for (const row of ga4.rows) {
      const name = (row.dimensions.sessionCampaignName || "(unset)").toLowerCase();
      const conv =
        Number(row.metrics.keyEvents || 0) || Number(row.metrics.conversions || 0);
      const existing = ga4By.get(name) ?? { sessions: 0, conv: 0, rev: 0 };
      existing.sessions += Number(row.metrics.sessions || 0);
      existing.conv += conv;
      existing.rev += Number(row.metrics.totalRevenue || 0);
      ga4By.set(name, existing);
    }

    // Join
    const joined = [...adsByCampaign.values()]
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
          spend: round(a.spend, 2),
          ads_conversions: a.ads_conversions,
          ga4_conversions: g.conv,
          attribution_gap_pct: round(gap, 1),
          sessions: g.sessions,
          ga4_revenue: round(g.rev, 2),
          real_cac: g.conv > 0 ? round(a.spend / g.conv, 2) : null,
          blended_roas: a.spend > 0 ? round(g.rev / a.spend, 2) : null,
        };
      })
      .sort((a, b) => b.spend - a.spend);

    const totals = {
      total_spend: round(
        [...adsByCampaign.values()].reduce((s, a) => s + a.spend, 0),
        2
      ),
      ads_conversions: [...adsByCampaign.values()].reduce(
        (s, a) => s + a.ads_conversions,
        0
      ),
      ga4_conversions: joined.reduce((s, c) => s + c.ga4_conversions, 0),
      ga4_revenue: round(
        joined.reduce((s, c) => s + c.ga4_revenue, 0),
        2
      ),
    };
    const blended_roas =
      totals.total_spend > 0 ? round(totals.ga4_revenue / totals.total_spend, 2) : 0;
    const real_cac =
      totals.ga4_conversions > 0
        ? round(totals.total_spend / totals.ga4_conversions, 2)
        : null;

    return NextResponse.json({
      configured: true,
      attached: true,
      range,
      totals: { ...totals, blended_roas, real_cac },
      campaigns: joined.slice(0, 20),
    });
  } catch (err) {
    return NextResponse.json(
      { configured: true, attached: true, error: (err as Error).message },
      { status: 500 }
    );
  }
}

function round(n: number, places: number): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

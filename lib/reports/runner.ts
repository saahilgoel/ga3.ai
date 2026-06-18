// Server-side report execution: pulls data for a ReportDef against the
// active workspace's properties, handling union aggregation + keyEvents
// fallback + custom handlers (cohort, funnel, attribution).

import { runReport, runRealtime } from "@/lib/ga4";
import type { PropertyWithToken } from "@/lib/properties";
import type { ReportDef, ReportQuery } from "./types";
import { getWorkspaceById } from "@/lib/db";
import { workspaceAdsCustomers } from "@/lib/workspace";
import { runGaql, isGoogleAdsConfigured } from "@/lib/sources/google_ads/api";

export type ReportRow = {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
};

export type ReportResult = {
  rows: ReportRow[];
  // Optional timeseries result (when topChart is set)
  timeseries?: ReportRow[];
  // For custom renderers (cohort grid, funnel steps, attribution rows)
  customPayload?: unknown;
  // Identifies which conversion metric was used (keyEvents | conversions)
  convMetric: "keyEvents" | "conversions" | null;
  // Total rows (before pagination)
  totalRows: number;
  generatedAt: number;
};

export async function runReportDef(args: {
  def: ReportDef;
  active: PropertyWithToken[];
  range: { start: string; end: string };
  workspaceId?: number;
  userId?: number;
}): Promise<ReportResult> {
  if (args.def.query.kind === "ads_gaql") {
    return runAdsGaql(args);
  }
  if (args.def.section === "performance" && args.def.slug === "spend-vs-conversions") {
    return runSpendVsConversions(args);
  }
  if (args.def.query.kind === "custom") {
    return runCustom(args);
  }
  const main = await runUnionQuery({
    active: args.active,
    q: args.def.query,
    range: args.range,
  });
  let timeseries: ReportRow[] | undefined;
  if (args.def.timeseriesQuery) {
    try {
      const ts = await runUnionQuery({
        active: args.active,
        q: args.def.timeseriesQuery,
        range: args.range,
      });
      timeseries = ts.rows;
    } catch (err) {
      console.warn("[reports] timeseries failed:", (err as Error).message);
    }
  }
  return {
    rows: main.rows,
    timeseries,
    convMetric: main.convMetric,
    totalRows: main.rows.length,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

// Run a ReportQuery across all active properties, summing metrics per
// dimension key. Handles realtime, keyEvents fallback.
async function runUnionQuery(args: {
  active: PropertyWithToken[];
  q: ReportQuery;
  range: { start: string; end: string };
}): Promise<{ rows: ReportRow[]; convMetric: "keyEvents" | "conversions" | null }> {
  const { active, q, range } = args;
  const isRealtime = q.kind === "realtime";

  async function fetchOne(p: PropertyWithToken, metrics: string[]) {
    if (isRealtime) {
      return runRealtime(p.accessToken, p.property.ga4_property_id, {
        dimensions: q.dimensions,
        metrics,
        limit: q.limit ?? 50,
      });
    }
    return runReport(p.accessToken, p.property.ga4_property_id, {
      dimensions: q.dimensions,
      metrics,
      startDate: range.start,
      endDate: range.end,
      limit: q.limit ?? 50,
      orderBy: q.orderBy,
    });
  }

  // Pick metric set, with keyEvents fallback if requested.
  let convMetric: "keyEvents" | "conversions" | null = null;
  let metrics = q.metrics;
  if (q.tryKeyEventsFallback && metrics.includes("conversions") && metrics.includes("keyEvents")) {
    metrics = metrics.filter((m) => m !== "conversions"); // avoid duplicate metric error
  }
  let perProperty;
  try {
    perProperty = await Promise.all(active.map((p) => fetchOne(p, metrics)));
    if (metrics.includes("keyEvents")) convMetric = "keyEvents";
  } catch (err) {
    if (q.tryKeyEventsFallback) {
      // Retry with `conversions` instead of `keyEvents`
      metrics = metrics.map((m) => (m === "keyEvents" ? "conversions" : m));
      perProperty = await Promise.all(active.map((p) => fetchOne(p, metrics)));
      convMetric = "conversions";
    } else {
      throw err;
    }
  }

  // Aggregate by dimension key
  const merged = new Map<string, ReportRow>();
  for (const r of perProperty) {
    for (const row of r.rows) {
      const key = q.dimensions.map((d) => row.dimensions[d] ?? "").join("|");
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { dimensions: { ...row.dimensions }, metrics: { ...row.metrics } });
      } else {
        for (const [k, v] of Object.entries(row.metrics)) {
          existing.metrics[k] = String(Number(existing.metrics[k] || 0) + Number(v || 0));
        }
      }
    }
  }
  let rows = [...merged.values()];
  // Re-sort if orderBy is set (because union may shift the order)
  if (q.orderBy) {
    const mk = q.orderBy.metric;
    rows.sort((a, b) => {
      const av = Number(a.metrics[mk] || 0);
      const bv = Number(b.metrics[mk] || 0);
      return q.orderBy!.desc ? bv - av : av - bv;
    });
  }
  if (q.limit) rows = rows.slice(0, q.limit);

  // If keyEvents was the source, also surface it under `keyEvents` alias for
  // consumers expecting that name even if we fell back to `conversions`.
  if (convMetric === "conversions") {
    for (const row of rows) {
      if (row.metrics.conversions != null && row.metrics.keyEvents == null) {
        row.metrics.keyEvents = row.metrics.conversions;
      }
    }
  }
  return { rows, convMetric };
}

// ----- Custom handlers -----

async function runCustom(args: {
  def: ReportDef;
  active: PropertyWithToken[];
  range: { start: string; end: string };
  workspaceId?: number;
}): Promise<ReportResult> {
  const { def, active, range } = args;
  switch (def.section + "/" + def.slug) {
    case "audience/cohorts":
      return runCohortCustom({ active, range });
    case "audience/demand-map":
      return runDemandMapCustom({ workspaceId: args.workspaceId });
    case "conversions/funnel":
      return runFunnelCustom({ active, range });
    case "conversions/attribution":
      return runAttributionCustom({ active, range });
    case "behavior/behavior-flow":
      return runBehaviorFlowCustom({ active, range });
    default:
      return {
        rows: [],
        convMetric: null,
        totalRows: 0,
        generatedAt: Math.floor(Date.now() / 1000),
      };
  }
}

// Demand map — Google Trends regional breakdown for the workspace's
// category + brand-relevant queries. Cached for 6h.
async function runDemandMapCustom(args: {
  workspaceId?: number;
}): Promise<ReportResult> {
  if (!args.workspaceId) {
    return {
      rows: [],
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  const sd = await import("@/lib/context/scrapingdog");
  const { getContextStatus } = await import("@/lib/context/db-helpers");
  const status = getContextStatus(args.workspaceId);
  const category =
    status?.industry_category ||
    status?.brand_name ||
    "e-commerce";
  // Build 4 queries: brand, category, and 2 generic intent queries derived
  // from category.
  const seeds = [
    status?.brand_name,
    category,
    // category often looks like "D2C hair care India" — strip trailing geo
    category?.replace(/\s+(india|usa|uk|us|global)\s*$/i, ""),
    // Generic shopping-intent variant
    `${category?.replace(/\s+(india|usa|uk|us|global)\s*$/i, "")} online`,
  ]
    .filter((s): s is string => !!s && s.length >= 3)
    .filter((s, i, arr) => arr.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
    .slice(0, 4);

  const results = await Promise.all(
    seeds.map(async (query) => {
      try {
        const r = await sd.googleTrendsByRegion(query, { geo: "IN" });
        return {
          query,
          regions: r.regions.map((rg) => ({
            geo: rg.geo,
            location: rg.location,
            value: rg.value,
          })),
        };
      } catch (err) {
        console.warn(`[reports/demand-map] trends failed for "${query}":`, (err as Error).message);
        return { query, regions: [] };
      }
    })
  );

  return {
    rows: results.flatMap((r) =>
      r.regions.map((rg) => ({
        dimensions: { query: r.query, geo: rg.geo, location: rg.location },
        metrics: { interest: String(rg.value) },
      }))
    ),
    customPayload: { queries: results },
    convMetric: null,
    totalRows: results.reduce((s, r) => s + r.regions.length, 0),
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

// Weekly cohorts × cohortNthWeek using GA4 v1beta cohortSpec.
async function runCohortCustom(args: {
  active: PropertyWithToken[];
  range: { start: string; end: string };
}): Promise<ReportResult> {
  const first = args.active[0];
  const today = new Date();
  function fmt(d: Date) {
    return d.toISOString().slice(0, 10);
  }
  const cohortCount = 8;
  const cohorts: Array<{ name: string; label: string; dateRange: { startDate: string; endDate: string } }> = [];
  for (let i = cohortCount - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    cohorts.push({
      name: `wk${cohortCount - 1 - i}`,
      label: fmt(start),
      dateRange: { startDate: fmt(start), endDate: fmt(end) },
    });
  }
  const body = {
    cohortSpec: {
      cohorts: cohorts.map((c) => ({
        name: c.name,
        dimension: "firstSessionDate",
        dateRange: c.dateRange,
      })),
      cohortsRange: {
        granularity: "WEEKLY",
        startOffset: 0,
        endOffset: cohortCount - 1,
      },
    },
    dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
    metrics: [{ name: "cohortActiveUsers" }],
  };
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${first.property.ga4_property_id}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${first.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`cohort runReport HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  type Resp = {
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };
  const data = (await res.json()) as Resp;
  type CohortRow = { cohort: string; week: number; users: number };
  const rows: CohortRow[] = [];
  for (const r of data.rows || []) {
    const cohortName = r.dimensionValues?.[0]?.value ?? "";
    const week = parseInt(r.dimensionValues?.[1]?.value ?? "0", 10);
    const users = Number(r.metricValues?.[0]?.value ?? 0);
    const meta = cohorts.find((c) => c.name === cohortName);
    rows.push({ cohort: meta?.label ?? cohortName, week, users });
  }
  return {
    rows: rows.map((r) => ({
      dimensions: { cohort: r.cohort, week: String(r.week) },
      metrics: { users: String(r.users) },
    })),
    customPayload: { cohorts: cohorts.map((c) => c.label), maxWeek: cohortCount - 1 },
    convMetric: null,
    totalRows: rows.length,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

// Auto-detect a funnel from real events and run runFunnelReport-style step counts.
const FUNNEL_CANDIDATES = [
  {
    kind: "D2C",
    steps: ["view_item", "add_to_cart", "begin_checkout", "purchase"],
  },
  {
    kind: "B2B",
    steps: ["page_view", "form_start", "form_submit", "generate_lead"],
  },
  {
    kind: "App",
    steps: ["session_start", "page_view", "user_engagement"],
  },
];

async function runFunnelCustom(args: {
  active: PropertyWithToken[];
  range: { start: string; end: string };
}): Promise<ReportResult> {
  const first = args.active[0];
  // Probe what events fire
  const probe = await runReport(first.accessToken, first.property.ga4_property_id, {
    dimensions: ["eventName"],
    metrics: ["eventCount"],
    startDate: args.range.start,
    endDate: args.range.end,
    limit: 200,
    orderBy: { metric: "eventCount", desc: true },
  });
  const fired = new Set(probe.rows.map((r) => r.dimensions.eventName || ""));
  const scored = FUNNEL_CANDIDATES.map((c) => ({
    ...c,
    score: c.steps.filter((s) => fired.has(s)).length,
  })).sort((a, b) => b.score - a.score);
  const pick = scored[0];
  if (pick.score < 2) {
    return {
      rows: [],
      customPayload: { error: "no_funnel_detected" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  const useSteps = pick.steps.filter((s) => fired.has(s));
  // Get event counts per step
  const stepRows = await Promise.all(
    useSteps.map(async (eventName) => {
      const r = await runReport(first.accessToken, first.property.ga4_property_id, {
        dimensions: ["eventName"],
        metrics: ["totalUsers", "eventCount"],
        startDate: args.range.start,
        endDate: args.range.end,
        limit: 10,
      });
      const row = r.rows.find((x) => x.dimensions.eventName === eventName);
      return {
        name: eventName,
        users: Number(row?.metrics.totalUsers || 0),
        count: Number(row?.metrics.eventCount || 0),
      };
    })
  );
  const steps = stepRows.map((s, i) => {
    const prev = stepRows[i - 1];
    const dropPct =
      i === 0 || !prev || prev.users === 0
        ? 0
        : ((prev.users - s.users) / prev.users) * 100;
    return { ...s, drop_pct: dropPct };
  });
  return {
    rows: steps.map((s) => ({
      dimensions: { name: s.name },
      metrics: { users: String(s.users), count: String(s.count), drop_pct: s.drop_pct.toFixed(1) },
    })),
    customPayload: { kind: pick.kind, steps },
    convMetric: null,
    totalRows: steps.length,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

// First-click vs last-click attribution comparison
async function runAttributionCustom(args: {
  active: PropertyWithToken[];
  range: { start: string; end: string };
}): Promise<ReportResult> {
  const first = args.active[0];
  async function pull(dim: string, metrics: string[]) {
    return runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: [dim],
      metrics,
      startDate: args.range.start,
      endDate: args.range.end,
      limit: 50,
      orderBy: { metric: "sessions", desc: true },
    });
  }
  let convKey: "keyEvents" | "conversions" = "keyEvents";
  let firstUser, session;
  try {
    [firstUser, session] = await Promise.all([
      pull("firstUserDefaultChannelGroup", ["sessions", "keyEvents"]),
      pull("sessionDefaultChannelGroup", ["sessions", "keyEvents"]),
    ]);
  } catch {
    convKey = "conversions";
    [firstUser, session] = await Promise.all([
      pull("firstUserDefaultChannelGroup", ["sessions", "conversions"]),
      pull("sessionDefaultChannelGroup", ["sessions", "conversions"]),
    ]);
  }
  const firstByCh = new Map<string, number>();
  for (const r of firstUser.rows) {
    firstByCh.set(
      r.dimensions.firstUserDefaultChannelGroup || "(unknown)",
      Number(r.metrics[convKey] || 0)
    );
  }
  const lastByCh = new Map<string, number>();
  for (const r of session.rows) {
    lastByCh.set(
      r.dimensions.sessionDefaultChannelGroup || "(unknown)",
      Number(r.metrics[convKey] || 0)
    );
  }
  const allCh = new Set<string>([...firstByCh.keys(), ...lastByCh.keys()]);
  const rows = [...allCh].map((ch) => {
    const f = firstByCh.get(ch) ?? 0;
    const l = lastByCh.get(ch) ?? 0;
    const delta = f > 0 ? ((l - f) / f) * 100 : l > 0 ? 100 : 0;
    return {
      dimensions: { channel: ch },
      metrics: {
        first_keyEvents: String(f),
        last_keyEvents: String(l),
        delta_pct: delta.toFixed(2),
      },
    };
  });
  rows.sort((a, b) => Number(b.metrics.last_keyEvents) - Number(a.metrics.last_keyEvents));
  return {
    rows,
    customPayload: { totals: { first: [...firstByCh.values()].reduce((s, v) => s + v, 0), last: [...lastByCh.values()].reduce((s, v) => s + v, 0) } },
    convMetric: convKey,
    totalRows: rows.length,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

// ----- Google Ads GAQL handler -----
// Runs the report's GAQL across every attached Ads customer and flattens
// the result to ReportRow shape (metrics keyed with `_` prefix to avoid
// collisions with GA4 metric names elsewhere).

async function runAdsGaql(args: {
  def: ReportDef;
  workspaceId?: number;
  userId?: number;
  range: { start: string; end: string };
}): Promise<ReportResult> {
  if (!isGoogleAdsConfigured()) {
    return {
      rows: [],
      customPayload: { error: "ads_not_configured" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  if (!args.workspaceId || !args.userId) {
    return {
      rows: [],
      customPayload: { error: "missing_workspace_context" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  const ws = getWorkspaceById(args.workspaceId);
  if (!ws) {
    return {
      rows: [],
      customPayload: { error: "workspace_not_found" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  const ads = workspaceAdsCustomers(ws);
  if (ads.length === 0) {
    return {
      rows: [],
      customPayload: { error: "no_ads_attached" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  const gaql = args.def.query.gaql;
  if (!gaql) {
    return {
      rows: [],
      customPayload: { error: "missing_gaql" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }

  const userId = args.userId;
  // Run in parallel across customers.
  const all = (
    await Promise.all(
      ads.map(async (c) => {
        try {
          const rows = (await runGaql({
            userId,
            customerId: c.source_id,
            query: gaql,
          })) as Array<Record<string, unknown>>;
          return rows.map((row) => normalizeAdsRow(row, c.display_name));
        } catch (err) {
          console.warn(`[ads gaql] customer ${c.source_id} failed:`, (err as Error).message);
          return [];
        }
      })
    )
  ).flat();

  return {
    rows: all,
    convMetric: null,
    totalRows: all.length,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

// Flatten a raw google-ads-api result row to ReportRow shape.
// Dimensions get `_` prefix and a human-readable extract;
// metrics get `_` prefix too with cost_micros converted to rupees.
function normalizeAdsRow(
  row: Record<string, unknown>,
  customerName: string
): ReportRow {
  const dims: Record<string, string> = {
    _customer_name: customerName,
  };
  const mets: Record<string, string> = {};

  // Common dimension extractions
  const campaign = row.campaign as { id?: string; name?: string; status?: string } | undefined;
  if (campaign?.name) dims._campaign_name = campaign.name;
  if (campaign?.status) dims._campaign_status = String(campaign.status);

  const adGroup = row.ad_group as { name?: string; status?: string } | undefined;
  if (adGroup?.name) dims._ad_group_name = adGroup.name;
  if (adGroup?.status) dims._ad_group_status = String(adGroup.status);

  const adGroupAd = row.ad_group_ad as
    | { ad?: { id?: string }; status?: string }
    | undefined;
  if (adGroupAd?.ad?.id) dims._ad_id = String(adGroupAd.ad.id);
  if (adGroupAd?.status) dims._ad_status = String(adGroupAd.status);

  const adGroupCriterion = row.ad_group_criterion as
    | { keyword?: { text?: string; match_type?: string } }
    | undefined;
  if (adGroupCriterion?.keyword?.text) dims._keyword = adGroupCriterion.keyword.text;
  if (adGroupCriterion?.keyword?.match_type) dims._match_type = String(adGroupCriterion.keyword.match_type);

  const searchTerm = row.search_term_view as { search_term?: string } | undefined;
  if (searchTerm?.search_term) dims._search_term = searchTerm.search_term;

  // Metrics
  const metrics = row.metrics as
    | {
        cost_micros?: string | number;
        clicks?: string | number;
        impressions?: string | number;
        conversions?: string | number;
        conversions_value?: string | number;
        ctr?: string | number;
        average_cpc?: string | number;
      }
    | undefined;
  if (metrics) {
    if (metrics.cost_micros != null)
      mets._spend = String(Number(metrics.cost_micros) / 1_000_000);
    if (metrics.clicks != null) mets._clicks = String(metrics.clicks);
    if (metrics.impressions != null) mets._impressions = String(metrics.impressions);
    if (metrics.conversions != null) mets._conversions = String(metrics.conversions);
    if (metrics.conversions_value != null)
      mets._conv_value = String(metrics.conversions_value);
    if (metrics.ctr != null) mets._ctr = String(metrics.ctr);
    if (metrics.average_cpc != null)
      mets._avg_cpc = String(Number(metrics.average_cpc) / 1_000_000);
  }

  return { dimensions: dims, metrics: mets };
}

// ----- Spend vs Conversions handler (Performance section) -----
// Reuses the same join logic as /api/dashboard/unified but returns
// ReportRow shape so the generic table renders it.

async function runSpendVsConversions(args: {
  def: ReportDef;
  active: PropertyWithToken[];
  workspaceId?: number;
  userId?: number;
  range: { start: string; end: string };
}): Promise<ReportResult> {
  if (!args.workspaceId || !args.userId) {
    return {
      rows: [],
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  if (!isGoogleAdsConfigured()) {
    return {
      rows: [],
      customPayload: { error: "ads_not_configured" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  const ws = getWorkspaceById(args.workspaceId);
  if (!ws) {
    return {
      rows: [],
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }
  const ads = workspaceAdsCustomers(ws);
  if (ads.length === 0 || args.active.length === 0) {
    return {
      rows: [],
      customPayload: { error: "need_both_ga4_and_ads" },
      convMetric: null,
      totalRows: 0,
      generatedAt: Math.floor(Date.now() / 1000),
    };
  }

  // Ads per-campaign
  type AdsRow = { campaign: string; spend: number; ads_conversions: number; rev: number };
  const adsBy = new Map<string, AdsRow>();
  await Promise.all(
    ads.map(async (c) => {
      try {
        const rows = (await runGaql({
          userId: args.userId as number,
          customerId: c.source_id,
          query:
            "SELECT campaign.name, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_7_DAYS",
        })) as Array<{
          campaign?: { name?: string };
          metrics?: {
            cost_micros?: string | number;
            conversions?: string | number;
            conversions_value?: string | number;
          };
        }>;
        for (const r of rows) {
          const name = r.campaign?.name || "(unnamed)";
          const k = name.toLowerCase();
          const existing = adsBy.get(k) ?? {
            campaign: name,
            spend: 0,
            ads_conversions: 0,
            rev: 0,
          };
          existing.spend += Number(r.metrics?.cost_micros || 0) / 1_000_000;
          existing.ads_conversions += Number(r.metrics?.conversions || 0);
          existing.rev += Number(r.metrics?.conversions_value || 0);
          adsBy.set(k, existing);
        }
      } catch {
        /* skip */
      }
    })
  );

  // GA4 per-campaign
  const first = args.active[0];
  let ga4;
  try {
    ga4 = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionCampaignName"],
      metrics: ["sessions", "keyEvents", "totalRevenue"],
      startDate: args.range.start,
      endDate: args.range.end,
      limit: 500,
    });
  } catch {
    ga4 = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionCampaignName"],
      metrics: ["sessions", "conversions", "totalRevenue"],
      startDate: args.range.start,
      endDate: args.range.end,
      limit: 500,
    });
  }
  const ga4By = new Map<string, { sessions: number; conv: number; rev: number }>();
  for (const r of ga4.rows) {
    const key = (r.dimensions.sessionCampaignName || "(unset)").toLowerCase();
    const conv = Number(r.metrics.keyEvents || 0) || Number(r.metrics.conversions || 0);
    const existing = ga4By.get(key) ?? { sessions: 0, conv: 0, rev: 0 };
    existing.sessions += Number(r.metrics.sessions || 0);
    existing.conv += conv;
    existing.rev += Number(r.metrics.totalRevenue || 0);
    ga4By.set(key, existing);
  }

  const rows: ReportRow[] = [...adsBy.values()]
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
      const cac = g.conv > 0 ? a.spend / g.conv : null;
      const roas = a.spend > 0 ? g.rev / a.spend : null;
      return {
        dimensions: { campaign: a.campaign },
        metrics: {
          spend: a.spend.toFixed(2),
          ads_conversions: String(a.ads_conversions),
          ga4_conversions: String(g.conv),
          // Percent column expects a 0..1 value (we multiply ×100 in formatter)
          attribution_gap_pct: (gap / 100).toFixed(4),
          real_cac: cac == null ? "" : cac.toFixed(2),
          blended_roas: roas == null ? "" : roas.toFixed(2),
        },
      };
    })
    .sort(
      (a, b) => Number(b.metrics.spend || 0) - Number(a.metrics.spend || 0)
    );

  return {
    rows,
    convMetric: null,
    totalRows: rows.length,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

// Behavior flow placeholder — Sankey aggregation deferred. Returns top pages
// with pageviews so the page can show *something*.
async function runBehaviorFlowCustom(args: {
  active: PropertyWithToken[];
  range: { start: string; end: string };
}): Promise<ReportResult> {
  const first = args.active[0];
  const r = await runReport(first.accessToken, first.property.ga4_property_id, {
    dimensions: ["pagePath"],
    metrics: ["screenPageViews"],
    startDate: args.range.start,
    endDate: args.range.end,
    limit: 30,
    orderBy: { metric: "screenPageViews", desc: true },
  });
  return {
    rows: r.rows,
    customPayload: { comingSoon: true },
    convMetric: null,
    totalRows: r.rows.length,
    generatedAt: Math.floor(Date.now() / 1000),
  };
}

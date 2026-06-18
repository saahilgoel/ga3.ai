// Dashboard data layer: fans out the GA4 calls behind the 10-tile dashboard,
// computes deltas vs comparison range, and shapes the response for the UI.

import { runReport, runRealtime, runWeeklyCohortRetention } from "./ga4";
import type { PropertyWithToken } from "./properties";
import { BUSINESS_TYPE_LABEL } from "./business-type";

export type RangePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_28_days"
  | "last_90_days"
  | "month_to_date"
  | "quarter_to_date"
  | "year_to_date"
  | "custom";

export type ComparePreset = "previous_period" | "previous_year" | "none";

export type DashboardRange = { start: string; end: string };

export type DashboardKpi = {
  current: number;
  prior: number | null;
  delta_pct: number | null;
  sparkline: number[];
};

export type DashboardResponse = {
  range: { start: string; end: string; label: string };
  compare_range: DashboardRange | null;
  realtime: { active_users: number; hourly_avg: number } | null;
  kpi: {
    sessions: DashboardKpi;
    users: DashboardKpi;
    engagement_rate: DashboardKpi;
    conversions: DashboardKpi;
  };
  traffic_over_time: {
    granularity: "daily" | "weekly" | "monthly";
    series: Array<{ date: string; sessions: number; users: number }>;
  };
  top_channels: Array<{
    channel: string;
    sessions: number;
    conversions: number;
    share_pct: number;
  }>;
  top_landing_pages: Array<{
    path: string;
    sessions: number;
    conversions: number;
    engagement_rate: number;
  }>;
  top_geography: {
    granularity: "city" | "country";
    rows: Array<{ name: string; sessions: number }>;
  };
  device_mix: {
    rows: Array<{
      device: string;
      sessions: number;
      share_pct: number;
      conversion_rate: number;
    }>;
  };
  tailored: TailoredDashboard | null;
  sampled: boolean;
  generated_at: number;
};

// Type-specific section the dashboard leads with — the "tuned for your business"
// payload. Shaped generically so the client renders KPIs / funnel / list for any type.
export type TailoredKpi = {
  key: string;
  label: string;
  value: number;
  format: "number" | "currency" | "percent" | "duration";
};

export type TailoredDashboard = {
  business_type: string;
  label: string;
  kpis: TailoredKpi[];
  funnel?: { title: string; steps: Array<{ name: string; value: number }> };
  list?: {
    title: string;
    format: "number" | "currency";
    rows: Array<{ name: string; value: number }>;
  };
  cohort?: {
    weeks: number;
    rows: Array<{ label: string; size: number; retention: number[] }>;
  };
};

// ------- Range helpers -------

export function resolvePreset(preset: RangePreset, custom?: DashboardRange): DashboardRange {
  if (preset === "custom" && custom) return custom;
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (d: Date, days: number) => {
    const c = new Date(d);
    c.setDate(c.getDate() + days);
    return c;
  };
  const end = new Date(today);
  switch (preset) {
    case "today":
      return { start: fmt(today), end: fmt(today) };
    case "yesterday": {
      const y = shift(today, -1);
      return { start: fmt(y), end: fmt(y) };
    }
    case "last_7_days":
      return { start: fmt(shift(end, -7)), end: fmt(shift(end, -1)) };
    case "last_28_days":
      return { start: fmt(shift(end, -28)), end: fmt(shift(end, -1)) };
    case "last_90_days":
      return { start: fmt(shift(end, -90)), end: fmt(shift(end, -1)) };
    case "month_to_date": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: fmt(start), end: fmt(today) };
    }
    case "quarter_to_date": {
      const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      return { start: fmt(qStart), end: fmt(today) };
    }
    case "year_to_date": {
      const yStart = new Date(today.getFullYear(), 0, 1);
      return { start: fmt(yStart), end: fmt(today) };
    }
    default:
      return { start: fmt(shift(end, -7)), end: fmt(shift(end, -1)) };
  }
}

export function computeComparison(
  range: DashboardRange,
  mode: ComparePreset
): DashboardRange | null {
  if (mode === "none") return null;
  const start = new Date(range.start);
  const end = new Date(range.end);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (mode === "previous_year") {
    const cs = new Date(start);
    cs.setFullYear(cs.getFullYear() - 1);
    const ce = new Date(end);
    ce.setFullYear(ce.getFullYear() - 1);
    return { start: fmt(cs), end: fmt(ce) };
  }
  // previous_period: equal-length window immediately before `start`
  const ce = new Date(start);
  ce.setDate(ce.getDate() - 1);
  const cs = new Date(ce);
  cs.setDate(cs.getDate() - (days - 1));
  return { start: fmt(cs), end: fmt(ce) };
}

export function pickGranularity(r: DashboardRange): "daily" | "weekly" | "monthly" {
  const d = Math.max(1, Math.round((new Date(r.end).getTime() - new Date(r.start).getTime()) / 86_400_000) + 1);
  if (d <= 31) return "daily";
  if (d <= 120) return "weekly";
  return "monthly";
}

function rangeLabel(preset: string, _range: DashboardRange): string {
  void _range;
  switch (preset) {
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "last_7_days":
      return "last 7 days";
    case "last_28_days":
      return "last 28 days";
    case "last_90_days":
      return "last 90 days";
    case "month_to_date":
      return "month to date";
    case "quarter_to_date":
      return "quarter to date";
    case "year_to_date":
      return "year to date";
    default:
      return "custom range";
  }
}

// ------- Data fetch -------

// Helper that sums metric across union properties (best-effort)
type ReportRow = { dimensions: Record<string, string>; metrics: Record<string, string> };

async function fetchUnion<T>(
  active: PropertyWithToken[],
  fn: (p: PropertyWithToken) => Promise<T>,
  merge: (results: T[]) => T
): Promise<T> {
  const results = await Promise.all(active.map((p) => fn(p)));
  return merge(results);
}

// Try `keyEvents` then fall back to `conversions`. Never request both — GA4 rejects.
async function runReportTryKey<T = ReturnType<typeof runReport>>(
  p: PropertyWithToken,
  args: {
    dimensions: string[];
    extraMetrics: string[];
    startDate: string;
    endDate: string;
    limit?: number;
    orderBy?: { metric: string; desc: boolean };
  }
): Promise<{ rows: ReportRow[]; convMetric: "keyEvents" | "conversions" }> {
  try {
    const r = await runReport(p.accessToken, p.property.ga4_property_id, {
      dimensions: args.dimensions,
      metrics: [...args.extraMetrics, "keyEvents"],
      startDate: args.startDate,
      endDate: args.endDate,
      limit: args.limit,
      orderBy: args.orderBy,
    });
    void (null as unknown as T);
    return { rows: r.rows, convMetric: "keyEvents" };
  } catch {
    const r = await runReport(p.accessToken, p.property.ga4_property_id, {
      dimensions: args.dimensions,
      metrics: [...args.extraMetrics, "conversions"],
      startDate: args.startDate,
      endDate: args.endDate,
      limit: args.limit,
      orderBy: args.orderBy,
    });
    return { rows: r.rows, convMetric: "conversions" };
  }
}

export async function buildDashboard(args: {
  active: PropertyWithToken[];
  range: DashboardRange;
  compareRange: DashboardRange | null;
  rangePresetLabel: string;
  businessType?: string;
}): Promise<DashboardResponse> {
  const { active, range, compareRange } = args;

  // Run all data fetches in parallel.
  const [
    realtimeRes,
    timeseriesCur,
    timeseriesPrior,
    channelsRes,
    landingRes,
    cityRes,
    countryRes,
    deviceRes,
    tailored,
  ] = await Promise.all([
    safeRealtime(active),
    timeseries(active, range),
    compareRange ? timeseries(active, compareRange) : Promise.resolve(null),
    topByDim(active, "sessionDefaultChannelGroup", range, 8),
    topByDim(active, "landingPagePlusQueryString", range, 8, ["engagementRate"]),
    topByDim(active, "city", range, 8),
    topByDim(active, "country", range, 8),
    topByDim(active, "deviceCategory", range, 5),
    buildTailored(active, range, args.businessType),
  ]);

  // KPIs from the timeseries (sum of daily values)
  const kpi = {
    sessions: kpiFromSeries(timeseriesCur, timeseriesPrior, "sessions"),
    users: kpiFromSeries(timeseriesCur, timeseriesPrior, "users"),
    engagement_rate: avgKpi(timeseriesCur, timeseriesPrior, "engagementRate"),
    conversions: kpiFromSeries(timeseriesCur, timeseriesPrior, "conversions"),
  };

  // Traffic over time series for the chart
  const traffic_over_time = {
    granularity: pickGranularity(range),
    series: timeseriesCur.daily.map((d) => ({
      date: d.date,
      sessions: d.sessions,
      users: d.users,
    })),
  };

  // Channels list
  const channelTotal = channelsRes.rows.reduce(
    (s, r) => s + Number(r.metrics.sessions || 0),
    0
  );
  const top_channels = channelsRes.rows.map((r) => ({
    channel: r.dimensions.sessionDefaultChannelGroup || "(unset)",
    sessions: Number(r.metrics.sessions || 0),
    conversions: Number(r.metrics[channelsRes.convMetric] || 0),
    share_pct:
      channelTotal > 0
        ? (Number(r.metrics.sessions || 0) / channelTotal) * 100
        : 0,
  }));

  // Landing pages
  const top_landing_pages = landingRes.rows.map((r) => ({
    path: r.dimensions.landingPagePlusQueryString || "(unset)",
    sessions: Number(r.metrics.sessions || 0),
    conversions: Number(r.metrics[landingRes.convMetric] || 0),
    engagement_rate: Number(r.metrics.engagementRate || 0),
  }));

  // Geography: pick city if traffic is concentrated in one country, else country
  const topCountry = countryRes.rows[0];
  const countryTotal = countryRes.rows.reduce(
    (s, r) => s + Number(r.metrics.sessions || 0),
    0
  );
  const countryShare =
    topCountry && countryTotal > 0
      ? Number(topCountry.metrics.sessions || 0) / countryTotal
      : 0;
  const useCity = countryShare >= 0.9;
  const top_geography = {
    granularity: (useCity ? "city" : "country") as "city" | "country",
    rows: (useCity ? cityRes.rows : countryRes.rows).map((r) => ({
      name: r.dimensions[useCity ? "city" : "country"] || "(unset)",
      sessions: Number(r.metrics.sessions || 0),
    })),
  };

  // Device mix
  const deviceTotal = deviceRes.rows.reduce(
    (s, r) => s + Number(r.metrics.sessions || 0),
    0
  );
  const device_mix = {
    rows: deviceRes.rows.map((r) => {
      const sessions = Number(r.metrics.sessions || 0);
      const conv = Number(r.metrics[deviceRes.convMetric] || 0);
      return {
        device: (r.dimensions.deviceCategory || "unknown").toLowerCase(),
        sessions,
        share_pct: deviceTotal > 0 ? (sessions / deviceTotal) * 100 : 0,
        conversion_rate: sessions > 0 ? (conv / sessions) * 100 : 0,
      };
    }),
  };

  return {
    range: { ...range, label: rangeLabel(args.rangePresetLabel, range) },
    compare_range: compareRange,
    realtime: realtimeRes,
    kpi,
    traffic_over_time,
    top_channels,
    top_landing_pages,
    top_geography,
    device_mix,
    tailored,
    sampled: false, // TODO: surface samplesReadCount from response.propertyQuota
    generated_at: Math.floor(Date.now() / 1000),
  };
}

// ------- Tailored (per business-type) section -------

type TRow = { dimensions: Record<string, string>; metrics: Record<string, string> };

async function safeRows(p: PropertyWithToken, args: RunReportArgsLite): Promise<TRow[]> {
  try {
    const r = await runReport(p.accessToken, p.property.ga4_property_id, args);
    return (r.rows as TRow[]) ?? [];
  } catch {
    return [];
  }
}

type RunReportArgsLite = {
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  limit?: number;
  orderBy?: { metric: string; desc: boolean };
};

async function eventCountMap(p: PropertyWithToken, range: DashboardRange): Promise<Map<string, number>> {
  const rows = await safeRows(p, {
    dimensions: ["eventName"],
    metrics: ["eventCount"],
    startDate: range.start,
    endDate: range.end,
    limit: 300,
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.dimensions.eventName, Number(r.metrics.eventCount || 0));
  return m;
}

// Adaptive funnel: each step maps to a list of candidate event names; we use the
// first one the property actually fires (count > 0) and drop steps with no match.
// So a property with custom event names (or no signup/login) gets a real funnel
// instead of zeros.
function funnelFrom(
  counts: Map<string, number>,
  title: string,
  spec: Array<{ name: string; events: string[] }>
) {
  const steps = spec
    .map((st) => {
      for (const ev of st.events) {
        const v = counts.get(ev);
        if (v && v > 0) return { name: st.name, value: v };
      }
      return null;
    })
    .filter((s): s is { name: string; value: number } => s != null);
  return steps.length >= 2 ? { title, steps } : undefined;
}

// Always-available fallback funnel from session-scoped metrics, so every
// property gets a meaningful funnel even when its type-specific events are
// absent (e.g. a SaaS that doesn't fire sign_up/login).
async function universalFunnel(p: PropertyWithToken, range: DashboardRange) {
  const m = await safeRows(p, {
    dimensions: [],
    metrics: ["sessions", "engagedSessions", "keyEvents"],
    startDate: range.start,
    endDate: range.end,
    limit: 1,
  });
  const r = m[0]?.metrics ?? {};
  const steps = [
    { name: "Sessions", value: Number(r.sessions || 0) },
    { name: "Engaged", value: Number(r.engagedSessions || 0) },
    { name: "Key events", value: Number(r.keyEvents || 0) },
  ].filter((s) => s.value > 0);
  return steps.length >= 2 ? { title: "Engagement funnel", steps } : undefined;
}

// Decide what the dashboard leads with, by business type. Every GA4 call is
// defensive — a property missing ecommerce/SaaS tracking just yields zeros, the
// base dashboard is unaffected.
async function buildTailored(
  active: PropertyWithToken[],
  range: DashboardRange,
  businessType?: string
): Promise<TailoredDashboard | null> {
  const p = active[0];
  if (!p || !businessType || businessType === "other") return null;
  const label = BUSINESS_TYPE_LABEL[businessType as keyof typeof BUSINESS_TYPE_LABEL] ?? "website";

  try {
    if (businessType === "ecommerce" || businessType === "marketplace") {
      const [m, prod, counts] = await Promise.all([
        safeRows(p, { dimensions: [], metrics: ["totalRevenue", "transactions", "averagePurchaseRevenue"], startDate: range.start, endDate: range.end, limit: 1 }),
        safeRows(p, { dimensions: ["itemName"], metrics: ["itemRevenue"], startDate: range.start, endDate: range.end, limit: 6, orderBy: { metric: "itemRevenue", desc: true } }),
        eventCountMap(p, range),
      ]);
      const r0 = m[0]?.metrics ?? {};
      const kpis: TailoredKpi[] = [
        { key: "revenue", label: "Revenue", value: Number(r0.totalRevenue || 0), format: "currency" },
        { key: "orders", label: "Orders", value: Number(r0.transactions || 0), format: "number" },
        { key: "aov", label: "Avg order value", value: Number(r0.averagePurchaseRevenue || 0), format: "currency" },
      ];
      const funnel = funnelFrom(counts, "Purchase journey", [
        { name: "Viewed", events: ["view_item", "view_item_list"] },
        { name: "Add to cart", events: ["add_to_cart"] },
        { name: "Checkout", events: ["begin_checkout", "add_payment_info", "add_shipping_info"] },
        { name: "Purchase", events: ["purchase", "ecommerce_purchase"] },
      ]);
      const rows = prod.map((r) => ({ name: r.dimensions.itemName || "(unknown)", value: Number(r.metrics.itemRevenue || 0) })).filter((r) => r.value > 0);
      const list = rows.length ? { title: "Top products by revenue", format: "currency" as const, rows } : undefined;
      return { business_type: businessType, label, kpis, funnel: funnel ?? (await universalFunnel(p, range)), list };
    }

    if (businessType === "saas") {
      const [m, counts, cohort] = await Promise.all([
        safeRows(p, { dimensions: [], metrics: ["active1DayUsers", "active7DayUsers", "active28DayUsers"], startDate: range.start, endDate: range.end, limit: 1 }),
        eventCountMap(p, range),
        runWeeklyCohortRetention(p.accessToken, p.property.ga4_property_id, { weeks: 6 }),
      ]);
      const r0 = m[0]?.metrics ?? {};
      const dau = Number(r0.active1DayUsers || 0);
      const mau = Number(r0.active28DayUsers || 0);
      const kpis: TailoredKpi[] = [
        { key: "dau", label: "DAU", value: dau, format: "number" },
        { key: "wau", label: "WAU", value: Number(r0.active7DayUsers || 0), format: "number" },
        { key: "mau", label: "MAU", value: mau, format: "number" },
        { key: "stickiness", label: "Stickiness (DAU/MAU)", value: mau > 0 ? (dau / mau) * 100 : 0, format: "percent" },
      ];
      const funnel = funnelFrom(counts, "Activation", [
        { name: "Sessions", events: ["session_start"] },
        { name: "Signups", events: ["sign_up", "signup", "registration", "register", "complete_registration"] },
        { name: "Logins", events: ["login", "log_in", "sign_in"] },
        { name: "Activated", events: ["tutorial_complete", "onboarding_complete", "first_open"] },
      ]);
      return { business_type: businessType, label, kpis, funnel: funnel ?? (await universalFunnel(p, range)), cohort: cohort ?? undefined };
    }

    if (businessType === "content") {
      const [m, pages, nvr, cohort] = await Promise.all([
        safeRows(p, { dimensions: [], metrics: ["engagedSessions", "engagementRate", "averageSessionDuration"], startDate: range.start, endDate: range.end, limit: 1 }),
        safeRows(p, { dimensions: ["pagePath"], metrics: ["engagedSessions"], startDate: range.start, endDate: range.end, limit: 6, orderBy: { metric: "engagedSessions", desc: true } }),
        safeRows(p, { dimensions: ["newVsReturning"], metrics: ["totalUsers"], startDate: range.start, endDate: range.end, limit: 5 }),
        runWeeklyCohortRetention(p.accessToken, p.property.ga4_property_id, { weeks: 6 }),
      ]);
      const r0 = m[0]?.metrics ?? {};
      const totalU = nvr.reduce((s, r) => s + Number(r.metrics.totalUsers || 0), 0);
      const returning = Number(nvr.find((r) => (r.dimensions.newVsReturning || "").toLowerCase().includes("return"))?.metrics.totalUsers || 0);
      const kpis: TailoredKpi[] = [
        { key: "engaged", label: "Engaged sessions", value: Number(r0.engagedSessions || 0), format: "number" },
        { key: "engRate", label: "Engagement rate", value: Number(r0.engagementRate || 0) * 100, format: "percent" },
        { key: "avgTime", label: "Avg engagement time", value: Number(r0.averageSessionDuration || 0), format: "duration" },
        { key: "returning", label: "Returning readers", value: totalU > 0 ? (returning / totalU) * 100 : 0, format: "percent" },
      ];
      const rows = pages.map((r) => ({ name: r.dimensions.pagePath || "(unknown)", value: Number(r.metrics.engagedSessions || 0) })).filter((r) => r.value > 0);
      const list = rows.length ? { title: "Top content by engaged sessions", format: "number" as const, rows } : undefined;
      return { business_type: businessType, label, kpis, funnel: await universalFunnel(p, range), list, cohort: cohort ?? undefined };
    }

    if (businessType === "leadgen") {
      const counts = await eventCountMap(p, range);
      const leads = (counts.get("generate_lead") || 0) + (counts.get("form_submit") || 0) + (counts.get("contact") || 0);
      const sessions = counts.get("session_start") || 0;
      const kpis: TailoredKpi[] = [
        { key: "leads", label: "Leads", value: leads, format: "number" },
        { key: "leadRate", label: "Lead conversion", value: sessions > 0 ? (leads / sessions) * 100 : 0, format: "percent" },
        { key: "sessions", label: "Sessions", value: sessions, format: "number" },
      ];
      const funnel = funnelFrom(counts, "Lead funnel", [
        { name: "Sessions", events: ["session_start"] },
        { name: "Form start", events: ["form_start", "begin_form"] },
        { name: "Lead", events: ["generate_lead", "form_submit", "contact"] },
      ]);
      return { business_type: businessType, label, kpis, funnel: funnel ?? (await universalFunnel(p, range)) };
    }
  } catch {
    return null;
  }
  return null;
}

// ------- Pieces -------

async function safeRealtime(
  active: PropertyWithToken[]
): Promise<{ active_users: number; hourly_avg: number } | null> {
  try {
    const r = await runRealtime(active[0].accessToken, active[0].property.ga4_property_id, {
      dimensions: [],
      metrics: ["activeUsers"],
      limit: 1,
    });
    const active_users = Number(r.rows[0]?.metrics.activeUsers || 0);
    // Hourly avg = last 60min activeUsers / 2 isn't accurate. Approximate via a
    // small 24h pull averaging hourly active users.
    let hourly_avg = 0;
    try {
      const hourly = await runReport(active[0].accessToken, active[0].property.ga4_property_id, {
        dimensions: ["dateHour"],
        metrics: ["activeUsers"],
        startDate: "1daysAgo",
        endDate: "today",
        limit: 48,
      });
      const vals = hourly.rows.map((row) => Number(row.metrics.activeUsers || 0));
      hourly_avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    } catch {
      hourly_avg = 0;
    }
    return { active_users, hourly_avg };
  } catch {
    return null;
  }
}

type TimeseriesRow = {
  date: string;
  sessions: number;
  users: number;
  engagementRate: number;
  conversions: number;
};
type Timeseries = {
  daily: TimeseriesRow[];
  totals: { sessions: number; users: number; engagementRate: number; conversions: number };
};

async function timeseries(
  active: PropertyWithToken[],
  range: DashboardRange
): Promise<Timeseries> {
  const partials = await Promise.all(
    active.map(async (p) => {
      // Try keyEvents first, fall back to conversions.
      const tryFetch = async (metrics: string[]) =>
        runReport(p.accessToken, p.property.ga4_property_id, {
          dimensions: ["date"],
          metrics,
          startDate: range.start,
          endDate: range.end,
          limit: 400,
        });
      let report;
      let convKey = "keyEvents";
      try {
        report = await tryFetch(["sessions", "totalUsers", "engagementRate", "keyEvents"]);
      } catch {
        convKey = "conversions";
        report = await tryFetch(["sessions", "totalUsers", "engagementRate", "conversions"]);
      }
      const rows: TimeseriesRow[] = report.rows.map((r) => ({
        date: formatDate(r.dimensions.date),
        sessions: Number(r.metrics.sessions || 0),
        users: Number(r.metrics.totalUsers || 0),
        engagementRate: Number(r.metrics.engagementRate || 0),
        conversions: Number(r.metrics[convKey] || 0),
      }));
      return rows;
    })
  );
  // Union: aggregate per-date across properties
  const byDate = new Map<string, TimeseriesRow>();
  for (const rows of partials) {
    for (const r of rows) {
      const cur =
        byDate.get(r.date) ?? {
          date: r.date,
          sessions: 0,
          users: 0,
          engagementRate: 0,
          conversions: 0,
        };
      cur.sessions += r.sessions;
      cur.users += r.users;
      cur.engagementRate += r.engagementRate; // averaged later by N properties
      cur.conversions += r.conversions;
      byDate.set(r.date, cur);
    }
  }
  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (active.length > 1) {
    for (const row of daily) row.engagementRate /= active.length;
  }
  const totals = {
    sessions: daily.reduce((s, r) => s + r.sessions, 0),
    users: daily.reduce((s, r) => s + r.users, 0),
    engagementRate:
      daily.length > 0
        ? daily.reduce((s, r) => s + r.engagementRate, 0) / daily.length
        : 0,
    conversions: daily.reduce((s, r) => s + r.conversions, 0),
  };
  return { daily, totals };
}

function kpiFromSeries(
  cur: Timeseries,
  prior: Timeseries | null,
  metric: keyof Timeseries["totals"]
): DashboardKpi {
  const currentVal = cur.totals[metric];
  const priorVal = prior ? prior.totals[metric] : null;
  const delta =
    priorVal != null && priorVal > 0 ? ((currentVal - priorVal) / priorVal) * 100 : null;
  return {
    current: round(currentVal),
    prior: priorVal != null ? round(priorVal) : null,
    delta_pct: delta != null ? roundTo(delta, 1) : null,
    sparkline: cur.daily.map((d) =>
      metric === "engagementRate" ? roundTo(d[metric] * 100, 2) : Math.round(d[metric])
    ),
  };
}

function avgKpi(
  cur: Timeseries,
  prior: Timeseries | null,
  metric: "engagementRate"
): DashboardKpi {
  // engagementRate is averaged across days, not summed
  const k = kpiFromSeries(cur, prior, metric);
  // current/prior were summed in totals; for engagement we average instead
  k.current = roundTo(cur.totals.engagementRate * 100, 2);
  k.prior =
    prior && prior.daily.length > 0 ? roundTo(prior.totals.engagementRate * 100, 2) : null;
  k.delta_pct =
    k.prior != null && k.prior > 0 ? roundTo(((k.current - k.prior) / k.prior) * 100, 1) : null;
  return k;
}

async function topByDim(
  active: PropertyWithToken[],
  dim: string,
  range: DashboardRange,
  limit: number,
  extraMetrics: string[] = []
): Promise<{ rows: ReportRow[]; convMetric: "keyEvents" | "conversions" }> {
  return fetchUnion(
    active,
    async (p) =>
      runReportTryKey(p, {
        dimensions: [dim],
        extraMetrics: ["sessions", ...extraMetrics],
        startDate: range.start,
        endDate: range.end,
        limit,
        orderBy: { metric: "sessions", desc: true },
      }),
    (results) => {
      // Merge by dimension value
      const merged = new Map<string, ReportRow>();
      let convMetric: "keyEvents" | "conversions" = "keyEvents";
      for (const r of results) {
        convMetric = r.convMetric;
        for (const row of r.rows) {
          const k = row.dimensions[dim] || "(unset)";
          const existing = merged.get(k);
          if (!existing) {
            merged.set(k, { dimensions: row.dimensions, metrics: { ...row.metrics } });
          } else {
            for (const [mk, mv] of Object.entries(row.metrics)) {
              existing.metrics[mk] = String(Number(existing.metrics[mk] || 0) + Number(mv || 0));
            }
          }
        }
      }
      const rows = [...merged.values()].sort(
        (a, b) => Number(b.metrics.sessions || 0) - Number(a.metrics.sessions || 0)
      );
      return { rows: rows.slice(0, limit), convMetric };
    }
  );
}

function formatDate(s: string | undefined): string {
  if (!s) return "";
  // GA4 'date' dim returns YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

function round(n: number): number {
  return Math.round(n);
}
function roundTo(n: number, places: number): number {
  const p = Math.pow(10, places);
  return Math.round(n * p) / p;
}

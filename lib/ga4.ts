import { google } from "googleapis";
import { authedClient } from "./google";

export type RunReportArgs = {
  dimensions: string[];
  metrics: string[];
  startDate: string;
  endDate: string;
  limit?: number;
  orderBy?: { metric: string; desc: boolean };
};

export async function runReport(accessToken: string, propertyId: string, args: RunReportArgs) {
  const data = google.analyticsdata({ version: "v1beta", auth: authedClient(accessToken) });
  const res = await data.properties.runReport({
    property: propertyId,
    requestBody: {
      dimensions: args.dimensions.map((name) => ({ name })),
      metrics: args.metrics.map((name) => ({ name })),
      dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
      limit: String(args.limit ?? 25),
      orderBys: args.orderBy
        ? [{ metric: { metricName: args.orderBy.metric }, desc: args.orderBy.desc }]
        : undefined,
    },
  });
  return shapeReport(res.data);
}

// Weekly cohort retention via the GA4 Data API cohortSpec. Returns N weekly
// cohorts (by firstSessionDate) × retention vs week 0. Null on any failure — the
// caller renders nothing rather than breaking the dashboard.
export async function runWeeklyCohortRetention(
  accessToken: string,
  propertyId: string,
  opts: { weeks?: number } = {}
): Promise<{ weeks: number; rows: Array<{ label: string; size: number; retention: number[] }> } | null> {
  const weeks = Math.min(8, Math.max(3, opts.weeks ?? 6));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = new Date();
  const cohortDefs = [];
  for (let i = 0; i < weeks; i++) {
    // cohort i: the week that started (weeks-1-i) weeks ago (oldest first).
    const end = new Date(today);
    end.setDate(end.getDate() - (weeks - 1 - i) * 7 - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    cohortDefs.push({
      name: `c${i}`,
      start: fmt(start),
      end: fmt(end),
    });
  }
  try {
    const data = google.analyticsdata({ version: "v1beta", auth: authedClient(accessToken) });
    const res = await data.properties.runReport({
      property: propertyId,
      requestBody: {
        dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
        metrics: [{ name: "cohortActiveUsers" }],
        cohortSpec: {
          cohorts: cohortDefs.map((c) => ({
            name: c.name,
            dimension: "firstSessionDate",
            dateRange: { startDate: c.start, endDate: c.end },
          })),
          cohortsRange: { granularity: "WEEKLY", startOffset: 0, endOffset: weeks - 1 },
        },
      },
    });
    const grid = new Map<string, Map<number, number>>();
    for (const r of res.data.rows ?? []) {
      const cohort = r.dimensionValues?.[0]?.value ?? "";
      const nth = Number(r.dimensionValues?.[1]?.value ?? "0");
      const v = Number(r.metricValues?.[0]?.value ?? "0");
      if (!grid.has(cohort)) grid.set(cohort, new Map());
      grid.get(cohort)!.set(nth, v);
    }
    const rows: Array<{ label: string; size: number; retention: number[] }> = [];
    for (let i = 0; i < weeks; i++) {
      const m = grid.get(`c${i}`);
      if (!m) continue;
      const base = m.get(0) ?? 0;
      const span = weeks - i; // a cohort only has data up to the current week
      const retention: number[] = [];
      for (let w = 0; w < span; w++) {
        const active = m.get(w) ?? 0;
        retention.push(base > 0 ? (active / base) * 100 : 0);
      }
      rows.push({ label: cohortDefs[i].start.slice(5), size: base, retention });
    }
    if (rows.every((r) => r.size === 0)) return null;
    return { weeks, rows };
  } catch {
    return null;
  }
}

export async function runRealtime(
  accessToken: string,
  propertyId: string,
  args: { dimensions: string[]; metrics: string[]; limit?: number }
) {
  const data = google.analyticsdata({ version: "v1beta", auth: authedClient(accessToken) });
  const res = await data.properties.runRealtimeReport({
    property: propertyId,
    requestBody: {
      dimensions: args.dimensions.map((name) => ({ name })),
      metrics: args.metrics.map((name) => ({ name })),
      limit: String(args.limit ?? 25),
    },
  });
  return shapeReport(res.data);
}

// GA4 Data API v1alpha runFunnelReport.
// Spec: https://developers.google.com/analytics/devguides/reporting/data/v1/funnels
export type FunnelStep = {
  name: string;
  eventName: string;
  filters?: Array<{ field: string; value: string }>; // optional same-step page/path/source filters
};

export type RunFunnelArgs = {
  steps: FunnelStep[];
  startDate: string;
  endDate: string;
  breakdownDimension?: string; // optional FunnelBreakdown.breakdownDimension
};

type FunnelRequestStep = {
  name: string;
  filterExpression: {
    andGroup?: {
      expressions: Array<{
        funnelEventFilter?: { eventName: string };
        funnelFieldFilter?: {
          fieldName: string;
          stringFilter: { matchType: string; value: string };
        };
      }>;
    };
    funnelEventFilter?: { eventName: string };
  };
};

export async function runFunnelReport(
  accessToken: string,
  propertyId: string,
  args: RunFunnelArgs
) {
  // Use raw fetch — googleapis v1alpha analyticsdata isn't reliably exposed
  // on every node-googleapis release. Endpoint is documented and stable.
  const body = {
    dateRanges: [{ startDate: args.startDate, endDate: args.endDate }],
    funnel: {
      steps: args.steps.map((s): FunnelRequestStep => {
        if (s.filters && s.filters.length > 0) {
          return {
            name: s.name,
            filterExpression: {
              andGroup: {
                expressions: [
                  { funnelEventFilter: { eventName: s.eventName } },
                  ...s.filters.map((f) => ({
                    funnelFieldFilter: {
                      fieldName: f.field,
                      stringFilter: { matchType: "EXACT", value: f.value },
                    },
                  })),
                ],
              },
            },
          };
        }
        return {
          name: s.name,
          filterExpression: { funnelEventFilter: { eventName: s.eventName } },
        };
      }),
    },
    ...(args.breakdownDimension
      ? {
          funnelBreakdown: {
            breakdownDimension: { name: args.breakdownDimension },
          },
        }
      : {}),
  };
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1alpha/${propertyId}:runFunnelReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`runFunnelReport HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  type FunnelTable = {
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };
  type FunnelResponse = {
    funnelTable?: FunnelTable;
    funnelVisualization?: FunnelTable;
  };
  const data = (await res.json()) as FunnelResponse;
  return shapeFunnel(data);
}

function shapeFunnel(data: {
  funnelTable?: {
    dimensionHeaders?: Array<{ name?: string }>;
    metricHeaders?: Array<{ name?: string }>;
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };
}) {
  const table = data.funnelTable;
  if (!table) return { steps: [], rows: [] };
  const dimHeaders = (table.dimensionHeaders || []).map((d) => d.name || "");
  const metHeaders = (table.metricHeaders || []).map((m) => m.name || "");
  const stepIdx = dimHeaders.indexOf("funnelStepName");
  const userIdx = metHeaders.indexOf("activeUsers");
  const rateIdx = metHeaders.indexOf("nextStepRate");
  const aggregated = new Map<string, { activeUsers: number; nextRate: number; index: number }>();
  let order = 0;
  (table.rows || []).forEach((r) => {
    const stepName =
      stepIdx >= 0 ? r.dimensionValues?.[stepIdx]?.value ?? "" : "";
    const users =
      userIdx >= 0 ? Number(r.metricValues?.[userIdx]?.value || 0) : 0;
    const rate =
      rateIdx >= 0 ? Number(r.metricValues?.[rateIdx]?.value || 0) : 0;
    if (!aggregated.has(stepName)) {
      aggregated.set(stepName, { activeUsers: users, nextRate: rate, index: order++ });
    } else {
      const cur = aggregated.get(stepName)!;
      cur.activeUsers += users;
    }
  });
  const steps = [...aggregated.entries()]
    .sort((a, b) => a[1].index - b[1].index)
    .map(([name, v]) => ({
      name,
      active_users: v.activeUsers,
      next_step_rate: v.nextRate,
    }));
  return { steps, rows: table.rows ?? [] };
}

export async function getMetadata(accessToken: string, propertyId: string) {
  const data = google.analyticsdata({ version: "v1beta", auth: authedClient(accessToken) });
  const res = await data.properties.getMetadata({ name: `${propertyId}/metadata` });
  const dimensions = (res.data.dimensions || []).map((d) => ({
    apiName: d.apiName,
    uiName: d.uiName,
    description: d.description,
    category: d.category,
  }));
  const metrics = (res.data.metrics || []).map((m) => ({
    apiName: m.apiName,
    uiName: m.uiName,
    description: m.description,
    category: m.category,
    type: m.type,
  }));
  return { dimensions, metrics };
}

type GaReport = {
  dimensionHeaders?: Array<{ name?: string | null }> | null;
  metricHeaders?: Array<{ name?: string | null; type?: string | null }> | null;
  rows?: Array<{
    dimensionValues?: Array<{ value?: string | null }> | null;
    metricValues?: Array<{ value?: string | null }> | null;
  }> | null;
  rowCount?: number | null;
};

function shapeReport(report: GaReport) {
  const dimHeaders = (report.dimensionHeaders || []).map((d) => d.name);
  const metHeaders = (report.metricHeaders || []).map((m) => ({ name: m.name, type: m.type }));
  const rows = (report.rows || []).map((r) => {
    const dims: Record<string, string> = {};
    (r.dimensionValues || []).forEach((dv, i) => {
      const key = dimHeaders[i];
      if (key) dims[key] = dv.value ?? "";
    });
    const mets: Record<string, string> = {};
    (r.metricValues || []).forEach((mv, i) => {
      const key = metHeaders[i]?.name;
      if (key) mets[key] = mv.value ?? "";
    });
    return { dimensions: dims, metrics: mets };
  });
  return {
    dimensionHeaders: dimHeaders,
    metricHeaders: metHeaders,
    rows,
    rowCount: report.rowCount ?? rows.length,
  };
}

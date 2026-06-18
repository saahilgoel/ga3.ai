// Report definitions for the /reports surface. Each ReportDef is a fully
// declarative description of a "classic" UA-style report:
//
//   - Where it lives in the tree (section + slug)
//   - How to query GA4 (dims + metrics + optional filter / orderBy)
//   - How to render it (KPIs, top chart, main table, breakdowns)
//   - Which agent owns the "Investigate" handoff and what to pre-fill

// Agent id is a string (Agent.id); kept loose to avoid coupling.
export type AgentId = string;

export type ReportSection =
  | "realtime"
  | "audience"
  | "acquisition"
  | "behavior"
  | "conversions"
  | "google_ads"
  | "performance";

export type ReportSlug = string;

// ---- Query spec ----

export type GA4MetricName = string;
export type GA4DimensionName = string;

export type ReportQuery = {
  kind: "report" | "realtime" | "custom" | "ads_gaql";
  dimensions: GA4DimensionName[];
  metrics: GA4MetricName[];
  limit?: number;
  orderBy?: { metric: string; desc: boolean };
  // If the metric set may include `keyEvents` or `conversions`, set this to
  // true so the runner tries the modern set first and falls back.
  tryKeyEventsFallback?: boolean;
  // For ads_gaql: the GAQL string to run per attached Ads customer.
  gaql?: string;
};

// ---- Layout slots ----

export type ChartSpec = {
  kind: "line" | "area" | "stackedArea";
  metrics: GA4MetricName[]; // metrics to plot from a daily-series subquery
  // Optional: granularity for the time dimension (`date` | `yearWeek` | `yearMonth`)
  timeDim?: "date" | "yearWeek" | "yearMonth";
};

export type KpiSpec = {
  label: string;
  metric: GA4MetricName; // from the headline-numbers subquery
  format: "int" | "compact" | "percent" | "duration_s";
  // Optional formatter that overrides format if more is needed
};

export type TableColumn = {
  label: string;
  // Pull from row.dimensions[key] or row.metrics[key]
  source: "dim" | "met";
  key: string;
  format?: "int" | "compact" | "percent" | "duration_s" | "string";
  // Show iconic bar-in-cell behind the value for this column
  bar?: boolean;
};

export type TableSpec = {
  columns: TableColumn[];
  // Default sort: column index, direction
  defaultSort?: { col: number; desc: boolean };
  pageSize?: number;
  filterDimIndex?: number; // column index that the search box filters
};

export type ReportLayout = {
  description?: string;
  topChart?: ChartSpec;
  kpis?: KpiSpec[];
  mainTable?: TableSpec;
  // Optional breakdown card (e.g. demographics pie / geo top 5)
  // Implemented inline for the few reports that need it (Audience Overview).
};

// ---- Report definition ----

export type ReportDef = {
  section: ReportSection;
  slug: ReportSlug; // unique within section
  title: string;
  // For the sub-nav left rail
  navLabel: string;
  // 1-line context shown under the title
  description?: string;
  // Agent to route "Investigate" to
  primaryAgent: AgentId | "any";
  // Build the pre-filled question for the conversation
  investigatePrompt: (ctx: InvestigateContext) => string;
  // Headline numbers (KPIs + table)
  query: ReportQuery;
  // Optional: secondary query for the daily time series (when topChart is set)
  timeseriesQuery?: ReportQuery;
  layout: ReportLayout;
  // Some reports need a custom rendering (cohort heatmap, sankey, real-time,
  // funnel viz). Render kind picks which client component is used.
  renderKind?:
    | "default" // header + chart + kpis + table
    | "audience_overview" // hero with 8 KPIs + 2 breakdowns
    | "cohort_heatmap"
    | "behavior_flow"
    | "funnel_viz"
    | "realtime_overview"
    | "new_vs_returning"
    | "demand_map";
  comingSoon?: boolean;
};

export type InvestigateContext = {
  dateRangeLabel: string;
  rows: Array<{ dimensions: Record<string, string>; metrics: Record<string, string> }>;
};

// ---- Section meta ----

export const SECTION_LABELS: Record<ReportSection, string> = {
  realtime: "Real-Time",
  audience: "Audience",
  acquisition: "Acquisition",
  behavior: "Behavior",
  conversions: "Conversions",
  google_ads: "Google Ads",
  performance: "Performance",
};

// Default expand state per spec
export const SECTION_DEFAULT_EXPANDED: Record<ReportSection, boolean> = {
  realtime: true,
  audience: true,
  acquisition: false,
  behavior: true,
  conversions: false,
  google_ads: false,
  performance: true,
};

import type { ReportDef, ReportSection } from "./types";

// Helper to keep the registry terse and uniform.
function r(
  section: ReportSection,
  slug: string,
  partial: Omit<ReportDef, "section" | "slug">
): ReportDef {
  return { section, slug, ...partial };
}

function topRowsBrief(
  rows: Array<{ dimensions: Record<string, string>; metrics: Record<string, string> }>,
  dimKey: string,
  metKey: string,
  n = 5
): string {
  return rows
    .slice(0, n)
    .map((row) => `${row.dimensions[dimKey] || "(unset)"} — ${row.metrics[metKey] || 0}`)
    .join("; ");
}

export const REPORTS: ReportDef[] = [
  // ===================== REAL-TIME =====================
  r("realtime", "overview", {
    title: "Real-Time Overview",
    navLabel: "Overview",
    description: "Live activity right now — refreshes every 30 seconds.",
    primaryAgent: "any",
    renderKind: "realtime_overview",
    investigatePrompt: () =>
      "Who's on the site right now? Where are they coming from and what are they reading?",
    query: {
      kind: "realtime",
      dimensions: [],
      metrics: ["activeUsers"],
    },
    layout: {},
  }),
  r("realtime", "locations", {
    title: "Real-Time Locations",
    navLabel: "Locations",
    primaryAgent: "kabir",
    investigatePrompt: (ctx) =>
      `Real-time visitors are concentrated in ${topRowsBrief(ctx.rows, "city", "activeUsers")}. What's drawing them right now?`,
    query: {
      kind: "realtime",
      dimensions: ["country", "city"],
      metrics: ["activeUsers"],
      limit: 25,
      orderBy: { metric: "activeUsers", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Country", source: "dim", key: "country" },
          { label: "City", source: "dim", key: "city" },
          { label: "Active users", source: "met", key: "activeUsers", format: "int", bar: true },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 25,
        filterDimIndex: 1,
      },
    },
  }),
  r("realtime", "traffic-sources", {
    title: "Real-Time Traffic Sources",
    navLabel: "Traffic Sources",
    primaryAgent: "maya",
    investigatePrompt: (ctx) =>
      `Top live sources: ${topRowsBrief(ctx.rows, "unifiedScreenName", "activeUsers")}. Anything suggesting a campaign just landed?`,
    query: {
      kind: "realtime",
      dimensions: ["unifiedScreenName"],
      metrics: ["activeUsers"],
      limit: 25,
      orderBy: { metric: "activeUsers", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Source / screen", source: "dim", key: "unifiedScreenName" },
          { label: "Active users", source: "met", key: "activeUsers", format: "int", bar: true },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 25,
        filterDimIndex: 0,
      },
    },
  }),
  r("realtime", "content", {
    title: "Real-Time Content",
    navLabel: "Content",
    primaryAgent: "arjun",
    investigatePrompt: (ctx) =>
      `Most-viewed pages right now: ${topRowsBrief(ctx.rows, "unifiedScreenName", "activeUsers")}. Anything unusual on top?`,
    query: {
      kind: "realtime",
      dimensions: ["unifiedScreenName"],
      metrics: ["activeUsers"],
      limit: 25,
      orderBy: { metric: "activeUsers", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Page", source: "dim", key: "unifiedScreenName" },
          { label: "Active users", source: "met", key: "activeUsers", format: "int", bar: true },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 25,
        filterDimIndex: 0,
      },
    },
  }),

  // ===================== AUDIENCE =====================
  r("audience", "overview", {
    title: "Audience Overview",
    navLabel: "Overview",
    description: "The legendary UA landing page — back in dark mode.",
    primaryAgent: "any",
    renderKind: "audience_overview",
    investigatePrompt: (ctx) => {
      const r0 = ctx.rows[0]?.metrics ?? {};
      return `Walk me through the audience for ${ctx.dateRangeLabel}. Users: ${r0.totalUsers ?? "?"}. Sessions: ${r0.sessions ?? "?"}. Bounce rate: ${r0.bounceRate ?? "?"}. What's the story?`;
    },
    query: {
      kind: "report",
      dimensions: [],
      metrics: [
        "totalUsers",
        "newUsers",
        "sessions",
        "sessionsPerUser",
        "screenPageViews",
        "screenPageViewsPerSession",
        "averageSessionDuration",
        "bounceRate",
      ],
      limit: 1,
    },
    timeseriesQuery: {
      kind: "report",
      dimensions: ["date"],
      metrics: ["sessions", "totalUsers"],
      limit: 400,
    },
    layout: {
      topChart: { kind: "line", metrics: ["sessions", "totalUsers"], timeDim: "date" },
      kpis: [
        { label: "Users", metric: "totalUsers", format: "compact" },
        { label: "New users", metric: "newUsers", format: "compact" },
        { label: "Sessions", metric: "sessions", format: "compact" },
        { label: "Sessions / user", metric: "sessionsPerUser", format: "int" },
        { label: "Pageviews", metric: "screenPageViews", format: "compact" },
        { label: "Pages / session", metric: "screenPageViewsPerSession", format: "int" },
        { label: "Avg session duration", metric: "averageSessionDuration", format: "duration_s" },
        { label: "Bounce rate", metric: "bounceRate", format: "percent" },
      ],
    },
  }),
  r("audience", "active-users", {
    title: "Active Users (1/7/14/28 day)",
    navLabel: "Active Users",
    primaryAgent: "priya",
    investigatePrompt: (ctx) =>
      `How is our active-user retention trending over ${ctx.dateRangeLabel}? Are weekly and 28-day windows diverging?`,
    query: {
      kind: "report",
      dimensions: ["date"],
      metrics: ["active1DayUsers", "active7DayUsers", "active28DayUsers"],
      limit: 400,
    },
    layout: {
      topChart: {
        kind: "line",
        metrics: ["active1DayUsers", "active7DayUsers", "active28DayUsers"],
        timeDim: "date",
      },
      mainTable: {
        columns: [
          { label: "Date", source: "dim", key: "date" },
          { label: "1-day active", source: "met", key: "active1DayUsers", format: "int", bar: true },
          { label: "7-day active", source: "met", key: "active7DayUsers", format: "int" },
          { label: "28-day active", source: "met", key: "active28DayUsers", format: "int" },
        ],
        defaultSort: { col: 0, desc: true },
        pageSize: 28,
      },
    },
  }),
  r("audience", "cohorts", {
    title: "Cohort Analysis",
    navLabel: "Cohorts",
    description: "Weekly acquisition cohorts × retention by week.",
    primaryAgent: "priya",
    renderKind: "cohort_heatmap",
    investigatePrompt: (ctx) =>
      `Look at the cohort retention grid for ${ctx.dateRangeLabel}. Which cohort is the stickiest and which is the leakiest?`,
    query: {
      kind: "custom", // handled by cohort handler
      dimensions: ["cohort", "cohortNthWeek"],
      metrics: ["cohortActiveUsers"],
    },
    layout: {},
  }),
  r("audience", "demographics", {
    title: "Demographics",
    navLabel: "Demographics",
    primaryAgent: "kabir",
    investigatePrompt: (ctx) =>
      `Who's the audience for ${ctx.dateRangeLabel}? Age + gender breakdown by sessions and conversions.`,
    query: {
      kind: "report",
      dimensions: ["userAgeBracket", "userGender"],
      metrics: ["sessions", "keyEvents"],
      tryKeyEventsFallback: true,
      limit: 100,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Age", source: "dim", key: "userAgeBracket" },
          { label: "Gender", source: "dim", key: "userGender" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 50,
      },
    },
    emptyHint:
      "GA4 returns no age/gender here. This needs Google Signals turned on (GA4 Admin → Data Settings → Data Collection → Google Signals) AND enough traffic — Google withholds demographics below a privacy threshold, so low-traffic properties often show nothing. Geo and Devices don't need Signals and will still work.",
  }),
  r("audience", "geo", {
    title: "Geo",
    navLabel: "Geo",
    primaryAgent: "kabir",
    investigatePrompt: (ctx) =>
      `Geo breakdown for ${ctx.dateRangeLabel} — top countries: ${topRowsBrief(ctx.rows, "country", "sessions")}. Are we underexposed anywhere?`,
    query: {
      kind: "report",
      dimensions: ["country", "region", "city"],
      metrics: ["sessions", "totalUsers", "keyEvents"],
      tryKeyEventsFallback: true,
      limit: 200,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Country", source: "dim", key: "country" },
          { label: "Region", source: "dim", key: "region" },
          { label: "City", source: "dim", key: "city" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
        ],
        defaultSort: { col: 3, desc: true },
        pageSize: 50,
        filterDimIndex: 2,
      },
    },
  }),
  r("audience", "demand-map", {
    title: "Demand Map",
    navLabel: "Demand Map",
    description:
      "Where in India is people searching for your category right now? Each state glows in proportion to its search interest, normalised 0-100.",
    primaryAgent: "kabir",
    renderKind: "demand_map",
    investigatePrompt: (ctx) =>
      `Demand map for ${ctx.dateRangeLabel}. Where should we expand or push ads next? Which states are under-indexing for us vs the category interest?`,
    query: {
      // Custom handler — runner picks up by renderKind via custom path.
      kind: "custom",
      dimensions: [],
      metrics: [],
    },
    layout: {},
  }),
  r("audience", "devices", {
    title: "Devices & Browser",
    navLabel: "Devices",
    primaryAgent: "priya",
    investigatePrompt: (ctx) =>
      `Device split for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "deviceCategory", "sessions")}. Mobile vs desktop conversion gap?`,
    query: {
      kind: "report",
      dimensions: ["deviceCategory", "operatingSystem", "browser"],
      metrics: ["sessions", "keyEvents", "engagementRate"],
      tryKeyEventsFallback: true,
      limit: 200,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Device", source: "dim", key: "deviceCategory" },
          { label: "OS", source: "dim", key: "operatingSystem" },
          { label: "Browser", source: "dim", key: "browser" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
          { label: "Engagement", source: "met", key: "engagementRate", format: "percent" },
        ],
        defaultSort: { col: 3, desc: true },
        pageSize: 50,
        filterDimIndex: 1,
      },
    },
  }),
  r("audience", "new-vs-returning", {
    title: "New vs Returning",
    navLabel: "New vs Returning",
    primaryAgent: "priya",
    renderKind: "new_vs_returning",
    investigatePrompt: (ctx) =>
      `Compare new vs returning visitors for ${ctx.dateRangeLabel}. Where are the returning ones converting better?`,
    query: {
      kind: "report",
      dimensions: ["newVsReturning"],
      metrics: ["sessions", "totalUsers", "keyEvents", "engagementRate"],
      tryKeyEventsFallback: true,
      limit: 10,
    },
    layout: {},
  }),

  // ===================== ACQUISITION =====================
  r("acquisition", "channels", {
    title: "Channels",
    navLabel: "Channels",
    primaryAgent: "maya",
    investigatePrompt: (ctx) =>
      `Walk me through channels for ${ctx.dateRangeLabel}. Top 5: ${topRowsBrief(ctx.rows, "sessionDefaultChannelGroup", "sessions")}. What's worth my attention?`,
    query: {
      kind: "report",
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions", "totalUsers", "keyEvents", "engagementRate"],
      tryKeyEventsFallback: true,
      limit: 25,
      orderBy: { metric: "sessions", desc: true },
    },
    timeseriesQuery: {
      kind: "report",
      dimensions: ["date", "sessionDefaultChannelGroup"],
      metrics: ["sessions"],
      limit: 400,
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Channel", source: "dim", key: "sessionDefaultChannelGroup" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
          { label: "Engagement", source: "met", key: "engagementRate", format: "percent" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 25,
        filterDimIndex: 0,
      },
    },
  }),
  r("acquisition", "source-medium", {
    title: "Source / Medium",
    navLabel: "Source/Medium",
    description: "The acquisition workhorse — every (source, medium) pair with full metrics.",
    primaryAgent: "maya",
    investigatePrompt: (ctx) =>
      `Top sources for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "sessionSource", "sessions")}. What changed vs prior period?`,
    query: {
      kind: "report",
      dimensions: ["sessionSource", "sessionMedium"],
      metrics: [
        "sessions",
        "totalUsers",
        "newUsers",
        "keyEvents",
        "engagementRate",
        "bounceRate",
        "averageSessionDuration",
      ],
      tryKeyEventsFallback: true,
      limit: 200,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Source", source: "dim", key: "sessionSource" },
          { label: "Medium", source: "dim", key: "sessionMedium" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "New users", source: "met", key: "newUsers", format: "compact" },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
          { label: "Engagement", source: "met", key: "engagementRate", format: "percent" },
          { label: "Bounce", source: "met", key: "bounceRate", format: "percent" },
          { label: "Avg dur (s)", source: "met", key: "averageSessionDuration", format: "duration_s" },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("acquisition", "referrals", {
    title: "Referrals",
    navLabel: "Referrals",
    primaryAgent: "maya",
    investigatePrompt: (ctx) =>
      `Top referrers for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "sessionSource", "sessions")}. Anyone new worth a partnership ping?`,
    query: {
      kind: "report",
      dimensions: ["sessionSource", "sessionMedium"],
      metrics: ["sessions", "totalUsers", "keyEvents", "engagementRate"],
      tryKeyEventsFallback: true,
      limit: 100,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Source", source: "dim", key: "sessionSource" },
          { label: "Medium", source: "dim", key: "sessionMedium" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
          { label: "Engagement", source: "met", key: "engagementRate", format: "percent" },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("acquisition", "campaigns", {
    title: "Campaigns",
    navLabel: "Campaigns",
    primaryAgent: "maya",
    investigatePrompt: (ctx) =>
      `Top campaigns for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "sessionCampaignName", "sessions")}. Which ones over- and under-performed?`,
    query: {
      kind: "report",
      dimensions: ["sessionCampaignName", "sessionSource", "sessionMedium"],
      metrics: ["sessions", "totalUsers", "keyEvents", "engagementRate"],
      tryKeyEventsFallback: true,
      limit: 200,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Campaign", source: "dim", key: "sessionCampaignName" },
          { label: "Source", source: "dim", key: "sessionSource" },
          { label: "Medium", source: "dim", key: "sessionMedium" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
        ],
        defaultSort: { col: 3, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),

  // ===================== BEHAVIOR =====================
  r("behavior", "all-pages", {
    title: "All Pages",
    navLabel: "All Pages",
    primaryAgent: "arjun",
    investigatePrompt: (ctx) =>
      `Top pages by traffic for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "pagePath", "screenPageViews")}. Where's the engagement leaking?`,
    query: {
      kind: "report",
      dimensions: ["pagePath"],
      metrics: ["screenPageViews", "sessions", "totalUsers", "engagementRate", "averageSessionDuration"],
      limit: 200,
      orderBy: { metric: "screenPageViews", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Page", source: "dim", key: "pagePath" },
          { label: "Pageviews", source: "met", key: "screenPageViews", format: "compact", bar: true },
          { label: "Sessions", source: "met", key: "sessions", format: "compact" },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "Engagement", source: "met", key: "engagementRate", format: "percent" },
          { label: "Avg dur (s)", source: "met", key: "averageSessionDuration", format: "duration_s" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("behavior", "landing-pages", {
    title: "Landing Pages",
    navLabel: "Landing Pages",
    description: "The report GA4 took out of the default UI. We put it back.",
    primaryAgent: "arjun",
    investigatePrompt: (ctx) =>
      `Audit landing pages for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "landingPagePlusQueryString", "sessions")}. Which page is over- or under-performing?`,
    query: {
      kind: "report",
      dimensions: ["landingPagePlusQueryString"],
      metrics: ["sessions", "keyEvents", "engagementRate", "bounceRate"],
      tryKeyEventsFallback: true,
      limit: 200,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Landing page", source: "dim", key: "landingPagePlusQueryString" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
          { label: "Engagement", source: "met", key: "engagementRate", format: "percent" },
          { label: "Bounce", source: "met", key: "bounceRate", format: "percent" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("behavior", "exit-pages", {
    title: "Exit Pages",
    navLabel: "Exit Pages",
    primaryAgent: "arjun",
    investigatePrompt: (ctx) =>
      `Pages users exit on most for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "pagePath", "exits")}. Which exits are intentional vs leaks?`,
    query: {
      kind: "report",
      dimensions: ["pagePath"],
      metrics: ["sessions", "screenPageViews", "exits", "userEngagementDuration"],
      limit: 200,
      orderBy: { metric: "exits", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Page", source: "dim", key: "pagePath" },
          { label: "Exits", source: "met", key: "exits", format: "compact", bar: true },
          { label: "Pageviews", source: "met", key: "screenPageViews", format: "compact" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("behavior", "site-search", {
    title: "Site Search",
    navLabel: "Site Search",
    primaryAgent: "arjun",
    investigatePrompt: (ctx) =>
      `What are users searching for in ${ctx.dateRangeLabel}? Top terms: ${topRowsBrief(ctx.rows, "searchTerm", "eventCount")}.`,
    query: {
      kind: "report",
      dimensions: ["searchTerm"],
      metrics: ["eventCount", "totalUsers"],
      limit: 100,
      orderBy: { metric: "eventCount", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Search term", source: "dim", key: "searchTerm" },
          { label: "Uses", source: "met", key: "eventCount", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("behavior", "events", {
    title: "Events",
    navLabel: "Events",
    primaryAgent: "any",
    investigatePrompt: (ctx) =>
      `Top events for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "eventName", "eventCount")}. Anything new appearing or dropping out?`,
    query: {
      kind: "report",
      dimensions: ["eventName"],
      metrics: ["eventCount", "totalUsers", "eventCountPerUser"],
      limit: 200,
      orderBy: { metric: "eventCount", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Event", source: "dim", key: "eventName" },
          { label: "Count", source: "met", key: "eventCount", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "Per user", source: "met", key: "eventCountPerUser", format: "int" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("behavior", "behavior-flow", {
    title: "Behavior Flow",
    navLabel: "Behavior Flow",
    description: "Top page-to-page transitions over the period.",
    primaryAgent: "arjun",
    renderKind: "behavior_flow",
    investigatePrompt: (ctx) =>
      `What's the flow through the site over ${ctx.dateRangeLabel}? Where do users branch off?`,
    query: {
      kind: "custom", // handled inline (page-transition aggregation)
      dimensions: ["pagePath"],
      metrics: ["screenPageViews"],
    },
    layout: {},
    comingSoon: true, // Sankey rendering deferred — placeholder shown
  }),

  // ===================== CONVERSIONS =====================
  r("conversions", "overview", {
    title: "Conversions Overview",
    navLabel: "Overview",
    primaryAgent: "any",
    investigatePrompt: (ctx) =>
      `Conversion mix for ${ctx.dateRangeLabel}: ${topRowsBrief(ctx.rows, "eventName", "eventCount")}. Which key event is driving the most value?`,
    query: {
      kind: "report",
      dimensions: ["eventName"],
      metrics: ["eventCount", "eventValue", "totalUsers"],
      limit: 50,
      orderBy: { metric: "eventCount", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Event", source: "dim", key: "eventName" },
          { label: "Count", source: "met", key: "eventCount", format: "compact", bar: true },
          { label: "Value", source: "met", key: "eventValue", format: "compact" },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("conversions", "funnel", {
    title: "Funnel Visualization",
    navLabel: "Funnel Viz",
    description: "Auto-detected funnel from your real events.",
    primaryAgent: "arjun",
    renderKind: "funnel_viz",
    investigatePrompt: (ctx) =>
      `Where's the worst drop in the funnel for ${ctx.dateRangeLabel}? Form 3 hypotheses.`,
    query: {
      kind: "custom", // handled by funnel handler
      dimensions: [],
      metrics: [],
    },
    layout: {},
  }),
  // ===================== GOOGLE ADS =====================
  r("google_ads", "overview", {
    title: "Google Ads Overview",
    navLabel: "Overview",
    description: "Spend, clicks, impressions, conversions, CPC across all attached customers.",
    primaryAgent: "vera",
    investigatePrompt: () =>
      "Give me a full overview of paid performance for the period. Where's the spend going, and is it producing?",
    query: {
      kind: "ads_gaql",
      dimensions: [],
      metrics: [],
      gaql:
        "SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.ctr, metrics.average_cpc FROM customer WHERE segments.date DURING LAST_7_DAYS",
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Account", source: "dim", key: "_customer_name" },
          { label: "Spend", source: "met", key: "_spend", format: "compact", bar: true },
          { label: "Clicks", source: "met", key: "_clicks", format: "compact" },
          { label: "Impressions", source: "met", key: "_impressions", format: "compact" },
          { label: "Conversions", source: "met", key: "_conversions", format: "compact" },
          { label: "Avg CPC", source: "met", key: "_avg_cpc", format: "int" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 25,
      },
    },
  }),
  r("google_ads", "campaigns", {
    title: "Campaigns",
    navLabel: "Campaigns",
    primaryAgent: "vera",
    investigatePrompt: (ctx) =>
      `Top campaigns by spend over ${ctx.dateRangeLabel}: ${ctx.rows.slice(0, 5).map((r) => r.dimensions._campaign_name).join("; ")}. Which are scaling efficiently?`,
    query: {
      kind: "ads_gaql",
      dimensions: [],
      metrics: [],
      gaql:
        "SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.cost_micros DESC LIMIT 200",
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Campaign", source: "dim", key: "_campaign_name" },
          { label: "Status", source: "dim", key: "_campaign_status" },
          { label: "Spend", source: "met", key: "_spend", format: "compact", bar: true },
          { label: "Clicks", source: "met", key: "_clicks", format: "compact" },
          { label: "Impr.", source: "met", key: "_impressions", format: "compact" },
          { label: "Conv.", source: "met", key: "_conversions", format: "compact" },
          { label: "CTR", source: "met", key: "_ctr", format: "percent" },
          { label: "Avg CPC", source: "met", key: "_avg_cpc", format: "int" },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("google_ads", "ad-groups", {
    title: "Ad Groups",
    navLabel: "Ad Groups",
    primaryAgent: "vera",
    investigatePrompt: (ctx) =>
      `Ad groups for ${ctx.dateRangeLabel}: ${ctx.rows.slice(0, 5).map((r) => r.dimensions._ad_group_name).join("; ")}. Any anomalies in CPC or conv rate?`,
    query: {
      kind: "ads_gaql",
      dimensions: [],
      metrics: [],
      gaql:
        "SELECT ad_group.name, campaign.name, ad_group.status, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.average_cpc FROM ad_group WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.cost_micros DESC LIMIT 200",
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Ad Group", source: "dim", key: "_ad_group_name" },
          { label: "Campaign", source: "dim", key: "_campaign_name" },
          { label: "Status", source: "dim", key: "_ad_group_status" },
          { label: "Spend", source: "met", key: "_spend", format: "compact", bar: true },
          { label: "Clicks", source: "met", key: "_clicks", format: "compact" },
          { label: "Conv.", source: "met", key: "_conversions", format: "compact" },
          { label: "Avg CPC", source: "met", key: "_avg_cpc", format: "int" },
        ],
        defaultSort: { col: 3, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("google_ads", "keywords", {
    title: "Keywords",
    navLabel: "Keywords",
    primaryAgent: "vera",
    investigatePrompt: (ctx) =>
      `Top keywords for ${ctx.dateRangeLabel}: ${ctx.rows.slice(0, 5).map((r) => r.dimensions._keyword).join("; ")}. Any wasteful spend on broad/loose matches?`,
    query: {
      kind: "ads_gaql",
      dimensions: [],
      metrics: [],
      gaql:
        "SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group.name, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.ctr FROM keyword_view WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.cost_micros DESC LIMIT 200",
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Keyword", source: "dim", key: "_keyword" },
          { label: "Match", source: "dim", key: "_match_type" },
          { label: "Ad Group", source: "dim", key: "_ad_group_name" },
          { label: "Spend", source: "met", key: "_spend", format: "compact", bar: true },
          { label: "Clicks", source: "met", key: "_clicks", format: "compact" },
          { label: "Conv.", source: "met", key: "_conversions", format: "compact" },
          { label: "CTR", source: "met", key: "_ctr", format: "percent" },
        ],
        defaultSort: { col: 3, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("google_ads", "search-terms", {
    title: "Search Terms",
    navLabel: "Search Terms",
    description: "The actual queries that triggered your ads — find wasted spend here.",
    primaryAgent: "vera",
    investigatePrompt: (ctx) =>
      `Search terms for ${ctx.dateRangeLabel}: ${ctx.rows.slice(0, 5).map((r) => r.dimensions._search_term).join("; ")}. Which terms got >100 clicks with zero conversions — negative keyword candidates?`,
    query: {
      kind: "ads_gaql",
      dimensions: [],
      metrics: [],
      gaql:
        "SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.cost_micros DESC LIMIT 200",
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Search term", source: "dim", key: "_search_term" },
          { label: "Campaign", source: "dim", key: "_campaign_name" },
          { label: "Spend", source: "met", key: "_spend", format: "compact", bar: true },
          { label: "Clicks", source: "met", key: "_clicks", format: "compact" },
          { label: "Conv.", source: "met", key: "_conversions", format: "compact" },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("google_ads", "ads", {
    title: "Ads",
    navLabel: "Ads",
    primaryAgent: "vera",
    investigatePrompt: () =>
      `Audit the top ad variants by spend. Which copy is pulling its weight and which is dead?`,
    query: {
      kind: "ads_gaql",
      dimensions: [],
      metrics: [],
      gaql:
        "SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions FROM ad_group_ad WHERE segments.date DURING LAST_7_DAYS ORDER BY metrics.cost_micros DESC LIMIT 200",
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Ad ID", source: "dim", key: "_ad_id" },
          { label: "Status", source: "dim", key: "_ad_status" },
          { label: "Ad Group", source: "dim", key: "_ad_group_name" },
          { label: "Spend", source: "met", key: "_spend", format: "compact", bar: true },
          { label: "Impr.", source: "met", key: "_impressions", format: "compact" },
          { label: "CTR", source: "met", key: "_ctr", format: "percent" },
          { label: "Conv.", source: "met", key: "_conversions", format: "compact" },
        ],
        defaultSort: { col: 3, desc: true },
        pageSize: 50,
        filterDimIndex: 2,
      },
    },
  }),

  // ===================== PERFORMANCE =====================
  r("performance", "spend-vs-conversions", {
    title: "Spend vs Conversions",
    navLabel: "Spend vs Conversions",
    description: "Cross-platform: Google Ads spend joined to GA4 attributed conversions by UTM.",
    primaryAgent: "vera",
    investigatePrompt: () =>
      "Walk me through the attribution gap. Which campaigns are over-credited in Ads vs reality?",
    query: { kind: "custom", dimensions: [], metrics: [] },
    layout: {
      mainTable: {
        columns: [
          { label: "Campaign", source: "dim", key: "campaign" },
          { label: "Spend", source: "met", key: "spend", format: "compact", bar: true },
          { label: "Ads conv", source: "met", key: "ads_conversions", format: "compact" },
          { label: "GA4 conv", source: "met", key: "ga4_conversions", format: "compact" },
          { label: "Gap %", source: "met", key: "attribution_gap_pct", format: "percent" },
          { label: "Real CAC", source: "met", key: "real_cac", format: "int" },
          { label: "ROAS", source: "met", key: "blended_roas", format: "int" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("performance", "wasted-spend", {
    title: "Wasted Spend Audit",
    navLabel: "Wasted Spend",
    description: "Search terms with high spend, zero conversions — negative keyword candidates.",
    primaryAgent: "vera",
    investigatePrompt: () =>
      "Surface every wasted-spend candidate: search terms with >100 clicks and zero conv, plus ad variants underperforming the campaign average. Give me a copy-paste list.",
    query: {
      kind: "ads_gaql",
      dimensions: [],
      metrics: [],
      gaql:
        "SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS AND metrics.clicks > 100 AND metrics.conversions = 0 ORDER BY metrics.cost_micros DESC LIMIT 100",
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Search term (negative kw candidate)", source: "dim", key: "_search_term" },
          { label: "Campaign", source: "dim", key: "_campaign_name" },
          { label: "Wasted spend", source: "met", key: "_spend", format: "compact", bar: true },
          { label: "Clicks", source: "met", key: "_clicks", format: "compact" },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
  r("performance", "channel-mix", {
    title: "Channel Mix",
    navLabel: "Channel Mix",
    description: "Velir-classified channel groups: share, conversion rate, vs prior period.",
    primaryAgent: "maya",
    investigatePrompt: (ctx) =>
      `Channel mix for ${ctx.dateRangeLabel}: ${ctx.rows.slice(0, 5).map((r) => r.dimensions.sessionDefaultChannelGroup).join("; ")}. What shifted vs prior?`,
    query: {
      kind: "report",
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions", "totalUsers", "keyEvents", "engagementRate"],
      tryKeyEventsFallback: true,
      limit: 25,
      orderBy: { metric: "sessions", desc: true },
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Channel", source: "dim", key: "sessionDefaultChannelGroup" },
          { label: "Sessions", source: "met", key: "sessions", format: "compact", bar: true },
          { label: "Users", source: "met", key: "totalUsers", format: "compact" },
          { label: "Conversions", source: "met", key: "keyEvents", format: "int" },
          { label: "Engagement", source: "met", key: "engagementRate", format: "percent" },
        ],
        defaultSort: { col: 1, desc: true },
        pageSize: 25,
        filterDimIndex: 0,
      },
    },
  }),

  r("conversions", "attribution", {
    title: "Attribution Paths",
    navLabel: "Attribution",
    description: "First-click vs last-click by channel — see who's over-credited.",
    primaryAgent: "maya",
    investigatePrompt: (ctx) =>
      `Compare first-click vs last-click attribution for ${ctx.dateRangeLabel}. Top channels: ${topRowsBrief(ctx.rows, "channel", "last_keyEvents")}. Who's stealing credit?`,
    query: {
      kind: "custom", // built from two parallel reports server-side
      dimensions: ["channel"],
      metrics: ["first_keyEvents", "last_keyEvents", "delta_pct"],
    },
    layout: {
      mainTable: {
        columns: [
          { label: "Channel", source: "dim", key: "channel" },
          { label: "First-click conv", source: "met", key: "first_keyEvents", format: "compact", bar: true },
          { label: "Last-click conv", source: "met", key: "last_keyEvents", format: "compact" },
          { label: "Δ %", source: "met", key: "delta_pct", format: "percent" },
        ],
        defaultSort: { col: 2, desc: true },
        pageSize: 50,
        filterDimIndex: 0,
      },
    },
  }),
];

export const REPORTS_BY_PATH: Record<string, ReportDef> = Object.fromEntries(
  REPORTS.map((r) => [`${r.section}/${r.slug}`, r])
);

export const REPORTS_BY_SECTION: Record<string, ReportDef[]> = REPORTS.reduce(
  (acc, r) => {
    acc[r.section] = acc[r.section] || [];
    acc[r.section].push(r);
    return acc;
  },
  {} as Record<string, ReportDef[]>
);

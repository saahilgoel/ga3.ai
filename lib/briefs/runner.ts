import { trackedModel } from "@/lib/usage/anthropic";
import { generateText, generateObject, stepCountIs } from "ai";
import { z } from "zod";
import { AGENT_MAP } from "@/lib/agents";
import { makeGa4Tools } from "@/lib/tools";
import { makeGoogleAdsTools } from "@/lib/sources/google_ads/tools";
import { makeMoEngageTools } from "@/lib/sources/moengage/tools";
import { workspaceAdsCustomers, workspaceMoEngage } from "@/lib/workspace";
import { runReport, runFunnelReport } from "@/lib/ga4";
import { classifyChannel, isPaidChannel, type ChannelGroup } from "@/lib/channel-grouping";
import {
  resolveWorkspaceWithTokens,
  type WorkspaceWithTokens,
} from "@/lib/workspace";
import { getWorkspaceById, setBriefOutput, setBriefError } from "@/lib/db";
import { publish } from "@/lib/pubsub";
import { getWorkspaceContextSummary } from "@/lib/context/summary";
import { stripEmojis } from "@/lib/strip-emojis";
import { briefOutputSchema, type BriefOutput, type BriefSection } from "./types";
import { BRIEF_TEMPLATES } from "./templates";
import { SiteProfile } from "@/lib/profile";

type RunCtx = {
  brief_id: number;
  workspace_id: number;
  template_id: string;
  params?: Record<string, unknown>;
  date_range_start?: string | null;
  date_range_end?: string | null;
  comparison_range_start?: string | null;
  comparison_range_end?: string | null;
};

export async function runBrief(ctx: RunCtx): Promise<BriefOutput> {
  const ws = getWorkspaceById(ctx.workspace_id);
  if (!ws) throw new Error("workspace_not_found");
  const tmpl = BRIEF_TEMPLATES[ctx.template_id];
  if (!tmpl) throw new Error("template_not_found");

  const withTokens = await resolveWorkspaceWithTokens(ws);
  if (withTokens.properties.length === 0) throw new Error("no_properties");

  const t0 = Date.now();
  let agentCalls = 0;
  let ga4Calls = 0;

  const ga4Tools = makeGa4Tools(withTokens.properties, ws.id);
  const adsTools = makeGoogleAdsTools({
    userId: ws.user_id,
    adsCustomers: workspaceAdsCustomers(ws).map((s) => ({
      customer_id: s.source_id,
      display_name: s.display_name,
      account_email: s.account_email,
    })),
    ga4Active: withTokens.properties,
  });
  const moeTools = makeMoEngageTools({
    userId: ws.user_id,
    attached: workspaceMoEngage(ws).length > 0,
    ga4Active: withTokens.properties,
  });
  const tools = { ...ga4Tools, ...adsTools, ...moeTools };
  const ctxSummary = await getWorkspaceContextSummary(ws.id);
  const baseSystem =
    buildBaseSystem(withTokens) +
    (ctxSummary.hasContext
      ? `\n\nBRAND CONTEXT (already loaded — weave into insights where relevant; cite by source):\n${ctxSummary.summary}`
      : "");

  try {
    const range = computeRange(ctx);
    let output: BriefOutput;

    switch (ctx.template_id) {
      case "monday_morning":
        output = await runMondayMorning({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 6;
        ga4Calls = 8;
        break;
      case "bleeding_money":
        output = await runBleedingMoney({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 2;
        ga4Calls = 4;
        break;
      case "landing_pages":
        output = await runLandingPages({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 2;
        ga4Calls = 2;
        break;
      case "find_whales":
        output = await runFindWhales({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 3;
        ga4Calls = 6;
        break;
      case "funnel_forensics":
        output = await runFunnelForensics({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 2;
        ga4Calls = 4;
        break;
      case "time_travel":
        output = await runTimeTravel({ ws, withTokens, tools, baseSystem, range, params: ctx.params });
        agentCalls = 6;
        ga4Calls = 10;
        break;
      case "hidden_segments":
        output = await runHiddenSegments({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 3;
        ga4Calls = 8;
        break;
      case "anomaly_hunter":
        output = await runAnomalyHunter({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 2;
        ga4Calls = 6;
        break;
      case "zombie_pages":
        output = await runZombiePages({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 2;
        ga4Calls = 2;
        break;
      case "todo_list":
        output = await runTodoList({ ws, withTokens, tools, baseSystem });
        agentCalls = 6;
        ga4Calls = 6;
        break;
      case "channel_mix_health":
        output = await runChannelMixHealth({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 1;
        ga4Calls = 2;
        break;
      case "funnel_health":
        output = await runFunnelHealth({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 1;
        ga4Calls = 2;
        break;
      case "attribution_comparison":
        output = await runAttributionComparison({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 1;
        ga4Calls = 2;
        break;
      case "cohort_retention":
        output = await runCohortRetention({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 1;
        ga4Calls = 1;
        break;
      case "landing_page_health":
        output = await runLandingPageHealth({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 1;
        ga4Calls = 1;
        break;
      case "weekly_paid_marketing":
        output = await runWeeklyPaidMarketing({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 1;
        ga4Calls = 2;
        break;
      case "wasted_spend_audit":
        output = await runWastedSpendAudit({ ws, withTokens, tools, baseSystem, range });
        agentCalls = 1;
        ga4Calls = 0;
        break;
      default:
        throw new Error(`unknown_template ${ctx.template_id}`);
    }

    const durationS = (Date.now() - t0) / 1000;
    output.footer = {
      duration_s: Math.round(durationS),
      agent_calls: agentCalls,
      ga4_calls: ga4Calls,
    };
    setBriefOutput({ id: ctx.brief_id, output, status: "done" });
    console.log(
      `[brief ${ctx.brief_id}] ${ctx.template_id} done in ${durationS.toFixed(1)}s`
    );
    try {
      publish(ws.user_id, {
        kind: "brief.completed",
        brief_id: ctx.brief_id,
        workspace_id: ws.id,
      });
    } catch {
      // pubsub is best-effort
    }
    return output;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[brief ${ctx.brief_id}] failed:`, msg);
    setBriefError({ id: ctx.brief_id, error: msg });
    throw err;
  }
}

type Range = {
  current: { start: string; end: string };
  prior: { start: string; end: string };
  label: string;
};

function computeRange(ctx: RunCtx): Range {
  if (ctx.date_range_start && ctx.date_range_end) {
    return {
      current: { start: ctx.date_range_start, end: ctx.date_range_end },
      prior: {
        start: ctx.comparison_range_start ?? "14daysAgo",
        end: ctx.comparison_range_end ?? "7daysAgo",
      },
      label: `${ctx.date_range_start} – ${ctx.date_range_end}`,
    };
  }
  return {
    current: { start: "7daysAgo", end: "today" },
    prior: { start: "14daysAgo", end: "7daysAgo" },
    label: "last 7 days",
  };
}

type RunArgs = {
  ws: { id: number; name: string; kind: string; user_id: number };
  withTokens: WorkspaceWithTokens;
  tools: ReturnType<typeof makeGa4Tools>;
  baseSystem: string;
  range: Range;
};

function buildBaseSystem(withTokens: WorkspaceWithTokens): string {
  const isUnion = withTokens.workspace.kind === "union";
  const propertySummaries = withTokens.properties
    .map(({ property }) => {
      let profile: SiteProfile | null = null;
      if (property.site_profile_json) {
        try {
          profile = JSON.parse(property.site_profile_json) as SiteProfile;
        } catch {
          profile = null;
        }
      }
      const business = profile?.business?.split(/[.!?]\s/)[0] || "(not auto-detected)";
      return `- ${property.display_name} (${property.website_url || "unknown URL"}): ${business}`;
    })
    .join("\n");
  const unionLine = isUnion
    ? `\nUnion workspace "${withTokens.workspace.name}" across ${withTokens.properties.length} properties: run_report sums; call run_per_property_report for per-property breakdowns.`
    : `\nSingle-property workspace "${withTokens.workspace.name}".`;
  return `You are a GA4 analytics assistant generating a BRIEF — a polished, shareable artifact, not a chat reply.

EMOJI POLICY: do not use emojis anywhere in your output.

ACTIVE PROPERTIES:
${propertySummaries}
${unionLine}

Be specific. Use real numbers. Indian numbering: 1,75,000 not 175,000. Format percentages with 1 decimal.`;
}

// ---------- Monday Morning Brief ----------

const MondaySchema = z.object({
  headline: z.string(),
  what_worked: z
    .array(z.object({ text: z.string(), agent: z.string().optional() }))
    .max(3),
  what_broke: z
    .array(z.object({ text: z.string(), agent: z.string().optional() }))
    .max(3),
  what_to_watch: z
    .array(z.object({ text: z.string(), agent: z.string().optional() }))
    .max(2),
  suggested_actions: z
    .array(
      z.object({
        action: z.string(),
        why: z.string(),
        owner: z.string().optional(),
        effort: z.enum(["S", "M", "L"]).optional(),
      })
    )
    .max(3),
});

async function runMondayMorning(args: RunArgs): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const perAgent = await Promise.all(
    args.withTokens.properties.length > 0
      ? ["maya", "arjun", "priya", "kabir", "raavi"].map((agentId) =>
          runAgentBriefScan(agentId, tools, baseSystem, range)
        )
      : []
  );
  const all = perAgent.flat();

  // Moderator synthesis
  const { object: synth } = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: MondaySchema,
    system: `You are the moderator. Synthesize agent findings into a Monday Morning Brief.
- Headline: ONE sentence summarizing the week.
- what_worked: top 3 wins, attributed to the agent.
- what_broke: top 3 problems, attributed.
- what_to_watch: 2 predictive items.
- suggested_actions: 3 specific actions with why + owner + effort (S/M/L).
Strip emojis. Indian numbering. Be direct, no fluff.`,
    prompt: `Agent findings (${all.length} items):\n${JSON.stringify(all, null, 2)}\n\nRange: ${range.label} (vs prior period).`,
  });

  return {
    template_id: "monday_morning",
    title: "Monday Morning Brief",
    subtitle: "Your weekly exec summary",
    range_label: range.label,
    sections: [
      {
        heading: "Headline",
        body: stripEmojis(synth.headline),
      },
      {
        heading: "What worked",
        bullets: synth.what_worked.map((b) => ({
          text: stripEmojis(b.text),
          agent: b.agent,
        })),
      },
      {
        heading: "What broke",
        bullets: synth.what_broke.map((b) => ({
          text: stripEmojis(b.text),
          agent: b.agent,
        })),
      },
      {
        heading: "What to watch",
        bullets: synth.what_to_watch.map((b) => ({
          text: stripEmojis(b.text),
          agent: b.agent,
        })),
      },
      {
        heading: "Suggested actions for this week",
        bullets: synth.suggested_actions.map((a) => ({
          text:
            `**${stripEmojis(a.action)}** — ${stripEmojis(a.why)}` +
            (a.owner ? ` (owner: ${a.owner}` : "") +
            (a.effort ? `${a.owner ? ", " : " ("}effort: ${a.effort})` : a.owner ? ")" : ""),
        })),
      },
    ],
  };
}

const AgentFindingSchema = z.object({
  finding: z.string(),
  category: z.enum(["what_worked", "what_broke", "what_to_watch"]).optional(),
});

async function runAgentBriefScan(
  agentId: string,
  tools: ReturnType<typeof makeGa4Tools>,
  baseSystem: string,
  range: Range
): Promise<Array<{ text: string; agent: string }>> {
  const agent = AGENT_MAP[agentId];
  if (!agent) return [];
  const system = `${baseSystem}

PERSONA: ${agent.systemPromptAddendum}

BRIEF TASK:
Compare this period (${range.current.start} → ${range.current.end}) vs prior (${range.prior.start} → ${range.prior.end}).
From YOUR lens, identify 1-2 wins ("what_worked") and 1-2 problems ("what_broke") from the data.
Quote specific numbers. Indian numbering. Percentages with 1 decimal.

Run 1-2 GA4 queries. Then return JSON ONLY:
\`\`\`json
[
  {"finding": "<=1 sentence with specific numbers>", "category": "what_worked"|"what_broke"|"what_to_watch"}
]
\`\`\``;

  try {
    const { text } = await generateText({
      model: trackedModel("claude-sonnet-4-6", "brief"),
      system,
      prompt: "Run your queries and return JSON.",
      tools,
      stopWhen: stepCountIs(4),
    });
    const parsed = extractJson(text);
    if (!parsed) return [];
    const valid = parsed
      .map((p) => AgentFindingSchema.safeParse(p))
      .filter((r) => r.success)
      .map((r) => r.data!);
    return valid.map((v) => ({ text: stripEmojis(v.finding), agent: agentId }));
  } catch {
    return [];
  }
}

function extractJson(text: string): unknown[] | null {
  const candidates: string[] = [];
  const block = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (block) candidates.push(block[1]);
  const arr = text.match(/\[\s*\{[\s\S]+?\}\s*\]/);
  if (arr) candidates.push(arr[0]);
  candidates.push(text);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try next
    }
  }
  return null;
}

// ---------- Bleeding Money ----------

async function runBleedingMoney(args: RunArgs): Promise<BriefOutput> {
  const { withTokens, baseSystem, range } = args;
  const first = withTokens.properties[0];

  // Deterministic pull: source × medium × campaign × sessions/keyEvents/engagement/bounce.
  // Try keyEvents first; fall back to conversions. Never request both.
  async function pull(metrics: string[]) {
    return runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionSource", "sessionMedium", "sessionCampaignName"],
      metrics,
      startDate: range.current.start,
      endDate: range.current.end,
      limit: 500,
      orderBy: { metric: "sessions", desc: true },
    });
  }
  let raw;
  let convKey: "keyEvents" | "conversions" = "keyEvents";
  try {
    raw = await pull(["sessions", "keyEvents", "engagementRate", "bounceRate"]);
  } catch {
    convKey = "conversions";
    raw = await pull(["sessions", "conversions", "engagementRate", "bounceRate"]);
  }

  // Aggregate by channel group via the Velir classifier.
  type ChAgg = {
    channel: ChannelGroup;
    sessions: number;
    conv: number;
    engagementSum: number;
    bounceSum: number;
    rowCount: number;
    paid: boolean;
  };
  const byCh = new Map<ChannelGroup, ChAgg>();
  for (const r of raw.rows) {
    const group = classifyChannel({
      source: r.dimensions.sessionSource,
      medium: r.dimensions.sessionMedium,
      campaign: r.dimensions.sessionCampaignName,
    });
    const agg = byCh.get(group) ?? {
      channel: group,
      sessions: 0,
      conv: 0,
      engagementSum: 0,
      bounceSum: 0,
      rowCount: 0,
      paid: isPaidChannel(group),
    };
    const sessions = Number(r.metrics.sessions || 0);
    agg.sessions += sessions;
    agg.conv += Number(r.metrics[convKey] || 0);
    agg.engagementSum += Number(r.metrics.engagementRate || 0) * sessions;
    agg.bounceSum += Number(r.metrics.bounceRate || 0) * sessions;
    agg.rowCount += 1;
    byCh.set(group, agg);
  }

  // Build organic baseline (weighted avg of all organic-* channels)
  const organicSessions = [...byCh.values()]
    .filter((c) => !c.paid && c.channel !== "Direct" && c.channel !== "Unassigned")
    .reduce((s, c) => s + c.sessions, 0);
  const organicConv = [...byCh.values()]
    .filter((c) => !c.paid && c.channel !== "Direct" && c.channel !== "Unassigned")
    .reduce((s, c) => s + c.conv, 0);
  const organicBounceWeighted = [...byCh.values()]
    .filter((c) => !c.paid && c.channel !== "Direct" && c.channel !== "Unassigned")
    .reduce((s, c) => s + c.bounceSum, 0);
  const orgConvRate =
    organicSessions > 0 ? (organicConv / organicSessions) * 100 : 0;
  const orgBounce =
    organicSessions > 0 ? (organicBounceWeighted / organicSessions) * 100 : 0;

  // Build per-channel rows (paid first, organic baseline at top)
  type Row = {
    channel: string;
    sessions: number;
    conv_rate: number;
    bounce_rate: number;
    vs_organic_delta_pct: number;
    bleeding: boolean;
    paid: boolean;
  };
  const allRows: Row[] = [...byCh.values()]
    .filter((c) => c.sessions > 0)
    .map((c) => {
      const convRate = c.sessions > 0 ? (c.conv / c.sessions) * 100 : 0;
      const bounceRate =
        c.sessions > 0 ? (c.bounceSum / c.sessions) * 100 : 0;
      const vsOrganic =
        orgConvRate > 0 ? ((convRate - orgConvRate) / orgConvRate) * 100 : 0;
      const bleeding =
        c.paid &&
        orgConvRate > 0 &&
        convRate < orgConvRate * 0.7 &&
        (bounceRate > orgBounce || c.conv === 0);
      return {
        channel: c.channel,
        sessions: c.sessions,
        conv_rate: convRate,
        bounce_rate: bounceRate,
        vs_organic_delta_pct: vsOrganic,
        bleeding,
        paid: c.paid,
      };
    })
    .sort((a, b) => {
      // Paid first (so they sit at the top), then by sessions desc.
      if (a.paid !== b.paid) return a.paid ? -1 : 1;
      return b.sessions - a.sessions;
    });

  if (allRows.length === 0) {
    return errorOutput(
      "bleeding_money",
      `No channel data for ${range.current.start} → ${range.current.end}.`
    );
  }

  // Render the table from real data.
  const tableRows = allRows.map((r) => [
    r.channel + (r.paid ? "" : " (organic)"),
    formatIndian(r.sessions),
    `${r.conv_rate.toFixed(2)}%`,
    `${r.bounce_rate.toFixed(1)}%`,
    orgConvRate > 0
      ? `${r.vs_organic_delta_pct >= 0 ? "+" : ""}${r.vs_organic_delta_pct.toFixed(1)}%`
      : "—",
  ]);
  const highlights = allRows
    .map((r, i) => (r.bleeding ? i : -1))
    .filter((i) => i >= 0);

  // Maya's interpretation via structured generation (no tool wandering).
  const totalPaidSessions = allRows
    .filter((r) => r.paid)
    .reduce((s, r) => s + r.sessions, 0);
  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      interpretation: z.string(),
      recommended_action: z.string(),
    }),
    system: `${baseSystem}\n\nPERSONA: You are Maya, ${AGENT_MAP.maya.title}. ${AGENT_MAP.maya.systemPromptAddendum}\n\nNo fluff. Numbers first.`,
    prompt: `Paid-channel audit for ${range.current.start} → ${range.current.end}:\n\nOrganic baseline conv-rate: ${orgConvRate.toFixed(2)}%, bounce: ${orgBounce.toFixed(1)}%.\n\nChannels:\n${JSON.stringify(allRows.slice(0, 12), null, 2)}\n\n"Bleeding" = paid channel converting at < 70% of organic AND (bounce > organic OR zero conversions). Total paid sessions: ${formatIndian(totalPaidSessions)}.\n\nReturn: a 3-4 sentence interpretation calling out which paid channels are bleeding with specific deltas, plus a one-sentence recommended_action.`,
  });

  return {
    template_id: "bleeding_money",
    title: "Where I'm Bleeding Money",
    subtitle: "Paid channels failing your organic baseline",
    range_label: range.label,
    sections: [
      {
        heading: "Paid vs organic audit (Velir classifier)",
        table: {
          columns: ["Channel", "Sessions", "Conv rate", "Bounce", "vs Organic"],
          rows: tableRows,
          highlight_rows: highlights,
        },
      },
      {
        heading: "Maya's read",
        body: stripEmojis(interp.object.interpretation),
      },
      {
        heading: "Action",
        body: stripEmojis(interp.object.recommended_action),
      },
    ],
  };
}

// ---------- Landing Pages ----------

const LandingSchema = z.object({
  pages: z.array(
    z.object({
      path: z.string(),
      sessions: z.string(),
      engagement_rate: z.string(),
      conversions: z.string(),
      conversion_rate: z.string(),
      primary_source: z.string().optional(),
      avg_engagement_seconds: z.string().optional(),
    })
  ),
  interpretation: z.string(),
});

async function runLandingPages(args: RunArgs): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const system = `${baseSystem}

PERSONA: ${AGENT_MAP.arjun.systemPromptAddendum}

TASK: Pull top 30 landing pages (dimension: landingPage) for ${range.current.start} → ${range.current.end}. Include: sessions, engagement rate, conversions, conversion rate (conversions/sessions). Run a second query for primary source/medium per landing page (top one).

Return JSON ONLY:
\`\`\`json
{
  "pages": [
    {"path": "/", "sessions": "1,23,456", "engagement_rate": "62.5%", "conversions": "1,234", "conversion_rate": "1.0%", "primary_source": "google / organic", "avg_engagement_seconds": "78"}
  ],
  "interpretation": "3-4 sentence summary"
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Run the landing-page queries now and return JSON.",
    tools,
    stopWhen: stepCountIs(4),
  });
  const parsed = parseObject(text, LandingSchema);
  if (!parsed) return errorOutput("landing_pages", "Could not compile landing page report.");

  const rows = parsed.pages.map((p) => [
    p.path,
    p.sessions,
    p.engagement_rate,
    p.conversions,
    p.conversion_rate,
    p.primary_source ?? "—",
  ]);

  return {
    template_id: "landing_pages",
    title: "The Real Landing Page Report",
    subtitle: "What GA4 stopped giving you",
    range_label: range.label,
    sections: [
      {
        heading: `Top ${parsed.pages.length} landing pages`,
        table: {
          columns: ["Page", "Sessions", "Engage %", "Conversions", "Conv rate", "Primary source"],
          rows,
        },
      },
      {
        heading: "Read",
        body: stripEmojis(parsed.interpretation),
      },
    ],
  };
}

// ---------- Find Whales ----------

const WhalesSchema = z.object({
  dimensions: z.array(
    z.object({
      dimension: z.string(),
      label: z.string(),
      converter_pct: z.number(),
      overall_pct: z.number(),
    })
  ),
  targeting_ideas: z.array(z.string()),
  interpretation: z.string(),
});

async function runFindWhales(args: RunArgs): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const system = `${baseSystem}

PERSONAS: Priya + Kabir collaborate.
${AGENT_MAP.priya.systemPromptAddendum}
${AGENT_MAP.kabir.systemPromptAddendum}

TASK: For ${range.current.start} → ${range.current.end}, identify the profile of HIGH-CONVERTING users. Compare across dimensions (deviceCategory, country, region, city, userAgeBracket, userGender, language). For each dimension, find the value where the share of *converters* most exceeds the share of *all users*. Return the top 4-6 dimensions with biggest over-index.

Return JSON ONLY:
\`\`\`json
{
  "dimensions": [
    {"dimension": "device", "label": "desktop", "converter_pct": 62.1, "overall_pct": 41.2}
  ],
  "targeting_ideas": ["1-sentence ad-targeting brief", "..."],
  "interpretation": "3-4 sentences"
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Run your queries and return JSON.",
    tools,
    stopWhen: stepCountIs(6),
  });
  const parsed = parseObject(text, WhalesSchema);
  if (!parsed) return errorOutput("find_whales", "Couldn't compile a converter profile.");

  const sections: BriefSection[] = [
    {
      heading: "Your high-converting visitor looks like",
      kpis: parsed.dimensions.map((d) => ({
        label: `${d.dimension}: ${d.label}`,
        value: `${d.converter_pct.toFixed(1)}%`,
        change_pct:
          d.overall_pct > 0
            ? ((d.converter_pct - d.overall_pct) / d.overall_pct) * 100
            : undefined,
        change_direction:
          d.converter_pct > d.overall_pct ? ("up" as const) : ("down" as const),
      })),
    },
    {
      heading: "Read",
      body: stripEmojis(parsed.interpretation),
    },
    {
      heading: "Where to find more like them",
      bullets: parsed.targeting_ideas.map((t) => ({ text: stripEmojis(t) })),
    },
  ];

  return {
    template_id: "find_whales",
    title: "Find My Whales",
    subtitle: "Profile of your highest-converting visitor",
    range_label: range.label,
    sections,
  };
}

// ---------- Funnel Forensics ----------

const FunnelSchema = z.object({
  steps: z.array(z.object({ label: z.string(), count: z.number() })),
  biggest_drop_index: z.number(),
  hypotheses: z.array(z.string()),
  interpretation: z.string(),
});

async function runFunnelForensics(args: RunArgs): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const system = `${baseSystem}

PERSONA: ${AGENT_MAP.arjun.systemPromptAddendum}

TASK: First call get_product_usage to see what events fire on this property. Then build a real funnel from the actual events present (e.g. session_start → view_item → add_to_cart → begin_checkout → purchase, OR session_start → page_view → sign_up depending on what you see). For ${range.current.start} → ${range.current.end}, get counts for each step. Identify the step transition with the biggest % drop and form 3 hypotheses.

Return JSON ONLY:
\`\`\`json
{
  "steps": [{"label": "session_start", "count": 100000}, ...],
  "biggest_drop_index": 2,
  "hypotheses": ["Hypothesis 1", "Hypothesis 2", "Hypothesis 3"],
  "interpretation": "3-4 sentence read"
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Detect the funnel and run the analysis now.",
    tools,
    stopWhen: stepCountIs(5),
  });
  const parsed = parseObject(text, FunnelSchema);
  if (!parsed) return errorOutput("funnel_forensics", "Could not detect a funnel from this property's events.");

  return {
    template_id: "funnel_forensics",
    title: "Funnel Forensics",
    subtitle: "Where your conversion flow bleeds",
    range_label: range.label,
    sections: [
      {
        heading: "Detected funnel",
        funnel: { steps: parsed.steps },
      },
      {
        heading: "Arjun's read",
        body: stripEmojis(parsed.interpretation),
      },
      {
        heading: "Hypotheses for the worst drop",
        bullets: parsed.hypotheses.map((h) => ({ text: stripEmojis(h) })),
      },
    ],
  };
}

// ---------- Time Travel ----------

const TimeTravelSchema = z.object({
  current_kpis: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      change_pct: z.number().optional(),
      change_direction: z.enum(["up", "down", "flat"]).optional(),
    })
  ),
  prior_kpis: z.array(z.object({ label: z.string(), value: z.string() })),
  biggest_movers: z.array(z.object({ text: z.string(), agent: z.string().optional() })),
  narrative: z.string(),
});

async function runTimeTravel(args: RunArgs & { params?: Record<string, unknown> }): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const system = `${baseSystem}

TASK: Compare period A (${range.current.start} → ${range.current.end}) vs period B (${range.prior.start} → ${range.prior.end}).
Pull sessions, totalUsers, conversion rate (conversions/sessions × 100), top source for each period. Identify 3-5 biggest movers across channels/pages/geos and write a one-paragraph narrative.

Return JSON ONLY:
\`\`\`json
{
  "current_kpis": [{"label": "Sessions", "value": "12,34,567", "change_pct": 12.4, "change_direction": "up"}, ...],
  "prior_kpis": [{"label": "Sessions", "value": "10,98,765"}, ...],
  "biggest_movers": [{"text": "Direct sessions up 32% WoW", "agent": "maya"}, ...],
  "narrative": "..."
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Run both periods and return JSON.",
    tools,
    stopWhen: stepCountIs(6),
  });
  const parsed = parseObject(text, TimeTravelSchema);
  if (!parsed) return errorOutput("time_travel", "Could not pull both date ranges.");

  return {
    template_id: "time_travel",
    title: "Time-Travel Comparison",
    subtitle: `${args.params?.label_a ?? "Period A"} vs ${args.params?.label_b ?? "Period B"}`,
    range_label: `${range.current.start} → ${range.current.end} vs ${range.prior.start} → ${range.prior.end}`,
    sections: [
      {
        heading: "Period A (current)",
        kpis: parsed.current_kpis,
      },
      {
        heading: "Period B (prior)",
        kpis: parsed.prior_kpis.map((k) => ({ label: k.label, value: k.value })),
      },
      {
        heading: "Biggest movers",
        bullets: parsed.biggest_movers.map((m) => ({
          text: stripEmojis(m.text),
          agent: m.agent,
        })),
      },
      { heading: "Narrative", body: stripEmojis(parsed.narrative) },
    ],
  };
}

// ---------- Hidden Segments ----------

const HiddenSchema = z.object({
  quietly_winning: z.array(
    z.object({
      dimension: z.string(),
      value: z.string(),
      conv_rate_pct: z.number(),
      sample_size: z.number(),
      vs_overall_delta_pct: z.number(),
    })
  ),
  quietly_losing: z.array(
    z.object({
      dimension: z.string(),
      value: z.string(),
      conv_rate_pct: z.number(),
      sample_size: z.number(),
      vs_overall_delta_pct: z.number(),
    })
  ),
  raavi_read: z.string(),
});

async function runHiddenSegments(args: RunArgs): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const system = `${baseSystem}

PERSONAS: Kabir + Raavi tag-team.
${AGENT_MAP.kabir.systemPromptAddendum}
${AGENT_MAP.raavi.systemPromptAddendum}

TASK: For ${range.current.start} → ${range.current.end}, compute the overall conversion rate (conversions/sessions × 100). Then break it down by every available dimension (deviceCategory, country, region, city, userAgeBracket, userGender, browser, operatingSystem, language, sessionSource). For each, find segments where conv rate is >50% higher than overall (Quietly Winning) and >50% lower (Quietly Losing). Filter out segments with <500 sessions. Top 5 in each direction.

Return JSON ONLY:
\`\`\`json
{
  "quietly_winning": [{"dimension": "device", "value": "desktop", "conv_rate_pct": 18.2, "sample_size": 12345, "vs_overall_delta_pct": 62.5}],
  "quietly_losing": [...],
  "raavi_read": "3-4 sentences on what contradictions the aggregate is hiding"
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Run the breakdowns now and return JSON.",
    tools,
    stopWhen: stepCountIs(6),
  });
  const parsed = parseObject(text, HiddenSchema);
  if (!parsed) return errorOutput("hidden_segments", "Could not compile segment breakdowns.");

  return {
    template_id: "hidden_segments",
    title: "Hidden Segments",
    subtitle: "What your headline number is hiding",
    range_label: range.label,
    sections: [
      {
        heading: "Quietly winning",
        table: {
          columns: ["Dimension", "Value", "Conv rate", "Sessions", "vs overall"],
          rows: parsed.quietly_winning.map((r) => [
            r.dimension,
            r.value,
            `${r.conv_rate_pct.toFixed(1)}%`,
            r.sample_size.toLocaleString("en-IN"),
            `+${r.vs_overall_delta_pct.toFixed(1)}%`,
          ]),
        },
      },
      {
        heading: "Quietly losing",
        table: {
          columns: ["Dimension", "Value", "Conv rate", "Sessions", "vs overall"],
          rows: parsed.quietly_losing.map((r) => [
            r.dimension,
            r.value,
            `${r.conv_rate_pct.toFixed(1)}%`,
            r.sample_size.toLocaleString("en-IN"),
            `${r.vs_overall_delta_pct.toFixed(1)}%`,
          ]),
        },
      },
      { heading: "Raavi's read", body: stripEmojis(parsed.raavi_read) },
    ],
  };
}

// ---------- Anomaly Hunter ----------

const AnomalySchema = z.object({
  anomalies: z.array(
    z.object({
      metric: z.string(),
      dimension: z.string(),
      old_value: z.string(),
      new_value: z.string(),
      z_score: z.number(),
      severity: z.enum(["high", "medium", "low"]),
      read: z.string(),
    })
  ),
});

async function runAnomalyHunter(args: RunArgs): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const system = `${baseSystem}

PERSONA: ${AGENT_MAP.raavi.systemPromptAddendum}

TASK: Compare last 7 days (${range.current.start} → ${range.current.end}) vs the prior 4 weeks as baseline. Pull metrics (sessions, conversions, engagementRate, bounceRate) broken down by top dimensions (sessionDefaultChannelGroup, pagePath, deviceCategory). Detect anomalies where this-week value diverges >2 z-scores from the 4-week mean. Surface only the 3-5 most material anomalies — channels disappearing, conv-rate flipping per channel, page losing engagement, device-class divergence.

Return JSON ONLY:
\`\`\`json
{
  "anomalies": [
    {"metric": "sessions", "dimension": "channel: Affiliates", "old_value": "12,345", "new_value": "1,234", "z_score": -3.1, "severity": "high", "read": "1-2 sentence read"}
  ]
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Hunt anomalies now.",
    tools,
    stopWhen: stepCountIs(6),
  });
  const parsed = parseObject(text, AnomalySchema);
  if (!parsed) return errorOutput("anomaly_hunter", "No detectable anomalies above the 2σ threshold.");

  return {
    template_id: "anomaly_hunter",
    title: "The Anomaly Hunter",
    subtitle: "What changed this week that shouldn't have",
    range_label: range.label,
    sections: [
      {
        heading: `${parsed.anomalies.length} material anomaly${parsed.anomalies.length === 1 ? "" : "s"}`,
        table: {
          columns: ["Metric", "Dimension", "Old", "New", "z-score", "Severity"],
          rows: parsed.anomalies.map((a) => [
            a.metric,
            a.dimension,
            a.old_value,
            a.new_value,
            a.z_score.toFixed(1),
            a.severity.toUpperCase(),
          ]),
        },
      },
      {
        heading: "Raavi's read on each",
        bullets: parsed.anomalies.map((a) => ({
          text: `**${a.dimension} / ${a.metric}** — ${stripEmojis(a.read)}`,
          agent: "raavi",
        })),
      },
    ],
  };
}

// ---------- Zombie Pages ----------

const ZombieSchema = z.object({
  zombies: z.array(
    z.object({
      path: z.string(),
      sessions: z.string(),
      engagement_pct: z.string(),
      conversion_pct: z.string(),
      recommendation: z.enum(["kill", "redirect", "improve"]),
    })
  ),
  underperforming: z.array(
    z.object({
      path: z.string(),
      sessions: z.string(),
      engagement_pct: z.string(),
      conversion_pct: z.string(),
      recommendation: z.enum(["kill", "redirect", "improve"]),
    })
  ),
  healthy: z.array(
    z.object({
      path: z.string(),
      sessions: z.string(),
      engagement_pct: z.string(),
      conversion_pct: z.string(),
    })
  ),
  interpretation: z.string(),
});

async function runZombiePages(args: RunArgs): Promise<BriefOutput> {
  const { tools, baseSystem, range } = args;
  const system = `${baseSystem}

PERSONA: ${AGENT_MAP.arjun.systemPromptAddendum}

TASK: Pull all pages with >100 sessions in ${range.current.start} → ${range.current.end}. For each, get engagement rate, conversions, conversion rate, primary source. Classify:
- Healthy: engagement > 50% AND (conversions > 0 OR sessions in top 25%)
- Underperforming: 20-50% engagement OR low conversions but decent traffic
- Zombie: <20% engagement AND zero conversions AND >100 sessions

Recommendation per Zombie/Underperforming: kill / redirect / improve based on traffic source and quality.

Return JSON ONLY:
\`\`\`json
{
  "zombies": [{"path": "/x", "sessions": "234", "engagement_pct": "12.1%", "conversion_pct": "0.0%", "recommendation": "kill"}],
  "underperforming": [...],
  "healthy": [...],
  "interpretation": "2-3 sentence summary"
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Classify pages now.",
    tools,
    stopWhen: stepCountIs(4),
  });
  const parsed = parseObject(text, ZombieSchema);
  if (!parsed) return errorOutput("zombie_pages", "Could not run page classification.");

  return {
    template_id: "zombie_pages",
    title: "Zombie Pages",
    subtitle: "Kill, redirect, or fix",
    range_label: range.label,
    sections: [
      {
        heading: `Zombies (${parsed.zombies.length})`,
        table: {
          columns: ["Page", "Sessions", "Engage %", "Conv %", "Action"],
          rows: parsed.zombies.map((p) => [
            p.path,
            p.sessions,
            p.engagement_pct,
            p.conversion_pct,
            p.recommendation,
          ]),
        },
      },
      {
        heading: `Underperforming (${parsed.underperforming.length})`,
        table: {
          columns: ["Page", "Sessions", "Engage %", "Conv %", "Action"],
          rows: parsed.underperforming.map((p) => [
            p.path,
            p.sessions,
            p.engagement_pct,
            p.conversion_pct,
            p.recommendation,
          ]),
        },
      },
      {
        heading: `Healthy (${parsed.healthy.length})`,
        table: {
          columns: ["Page", "Sessions", "Engage %", "Conv %"],
          rows: parsed.healthy.map((p) => [
            p.path,
            p.sessions,
            p.engagement_pct,
            p.conversion_pct,
          ]),
        },
      },
      { heading: "Read", body: stripEmojis(parsed.interpretation) },
    ],
  };
}

// ---------- To-Do List ----------

const TodoSchema = z.object({
  actions: z.array(
    z.object({
      action: z.string(),
      why: z.string(),
      owner: z.string().optional(),
      effort: z.enum(["S", "M", "L"]).optional(),
    })
  ),
});

async function runTodoList(args: Omit<RunArgs, "range"> & { range?: Range }): Promise<BriefOutput> {
  const { tools, baseSystem } = args;
  const system = `${baseSystem}

TASK: You are the moderator. Run lightweight queries across all five agent domains for the last 7 days. Synthesize 5 specific, time-bound actions the team should take this week. Each action: 1 sentence + why (1 sentence) + suggested owner role (Performance Marketing / Web Eng / Product / CRO / Content) + effort (S/M/L).

Return JSON ONLY:
\`\`\`json
{
  "actions": [
    {"action": "Pause the FLAT600 retargeting set", "why": "CPL up 3x WoW with no conversion lift", "owner": "Performance Marketing", "effort": "S"}
  ]
}
\`\`\``;

  const { text } = await generateText({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    system,
    prompt: "Run your queries and produce the list.",
    tools,
    stopWhen: stepCountIs(6),
  });
  const parsed = parseObject(text, TodoSchema);
  if (!parsed) return errorOutput("todo_list", "Could not compile this week's action list.");

  return {
    template_id: "todo_list",
    title: "Tomorrow's To-Do List",
    subtitle: "Five specific actions for this week",
    sections: [
      {
        heading: "This week's actions",
        bullets: parsed.actions.map((a) => ({
          text:
            `**${stripEmojis(a.action)}** — ${stripEmojis(a.why)}` +
            (a.owner ? ` (${a.owner}` : "") +
            (a.effort ? `${a.owner ? ", " : " ("}effort: ${a.effort})` : a.owner ? ")" : ""),
        })),
      },
    ],
  };
}

// ---------- helpers ----------

function parseObject<T extends z.ZodTypeAny>(text: string, schema: T): z.infer<T> | null {
  const candidates: string[] = [];
  const block = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (block) candidates.push(block[1]);
  const obj = text.match(/\{[\s\S]+\}/);
  if (obj) candidates.push(obj[0]);
  candidates.push(text);
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const r = schema.safeParse(parsed);
      if (r.success) return r.data;
    } catch {
      // try next
    }
  }
  return null;
}

function errorOutput(template_id: string, msg: string): BriefOutput {
  return {
    template_id,
    title: BRIEF_TEMPLATES[template_id]?.title ?? "Brief",
    sections: [{ heading: "Could not generate", body: stripEmojis(msg) }],
  };
}

// ---------- Channel Mix Health (Velir-classifier-driven) ----------

type ChannelRow = {
  channel: ChannelGroup;
  sessions: number;
  conversions: number;
  prior_sessions: number;
  conv_rate: number;
  prior_conv_rate: number;
  share_pct: number;
  prior_share_pct: number;
};

async function runChannelMixHealth(args: RunArgs): Promise<BriefOutput> {
  const { withTokens, baseSystem, range } = args;
  const first = withTokens.properties[0];

  // Pull source / medium / campaign × sessions + conversion-count.
  // GA4 treats `keyEvents` and `conversions` as duplicates (synonyms after the
  // mid-2024 rename) — requesting both errors with "Found duplicate metrics".
  // Try keyEvents first; fall back to conversions on older properties.
  async function pull(start: string, end: string) {
    const tryFetch = async (metrics: string[]) =>
      runReport(first.accessToken, first.property.ga4_property_id, {
        dimensions: ["sessionSource", "sessionMedium", "sessionCampaignName"],
        metrics,
        startDate: start,
        endDate: end,
        limit: 500,
        orderBy: { metric: "sessions", desc: true },
      });
    try {
      return await tryFetch(["sessions", "keyEvents"]);
    } catch {
      return await tryFetch(["sessions", "conversions"]);
    }
  }
  const [cur, prior] = await Promise.all([
    pull(range.current.start, range.current.end),
    pull(range.prior.start, range.prior.end),
  ]);

  type Agg = { sessions: number; conversions: number };
  function aggregate(rows: typeof cur.rows): Map<ChannelGroup, Agg> {
    const m = new Map<ChannelGroup, Agg>();
    for (const r of rows) {
      const group = classifyChannel({
        source: r.dimensions.sessionSource,
        medium: r.dimensions.sessionMedium,
        campaign: r.dimensions.sessionCampaignName,
      });
      const agg = m.get(group) ?? { sessions: 0, conversions: 0 };
      agg.sessions += Number(r.metrics.sessions || 0);
      // Prefer keyEvents over conversions
      const ke = Number(r.metrics.keyEvents || 0);
      agg.conversions += ke > 0 ? ke : Number(r.metrics.conversions || 0);
      m.set(group, agg);
    }
    return m;
  }
  const curAgg = aggregate(cur.rows);
  const priorAgg = aggregate(prior.rows);

  const curTotal = [...curAgg.values()].reduce((s, x) => s + x.sessions, 0) || 1;
  const priorTotal = [...priorAgg.values()].reduce((s, x) => s + x.sessions, 0) || 1;

  const channels: ChannelRow[] = [];
  const allKeys = new Set<ChannelGroup>([...curAgg.keys(), ...priorAgg.keys()]);
  for (const k of allKeys) {
    const c = curAgg.get(k) ?? { sessions: 0, conversions: 0 };
    const p = priorAgg.get(k) ?? { sessions: 0, conversions: 0 };
    channels.push({
      channel: k,
      sessions: c.sessions,
      conversions: c.conversions,
      prior_sessions: p.sessions,
      conv_rate: c.sessions > 0 ? (c.conversions / c.sessions) * 100 : 0,
      prior_conv_rate: p.sessions > 0 ? (p.conversions / p.sessions) * 100 : 0,
      share_pct: (c.sessions / curTotal) * 100,
      prior_share_pct: (p.sessions / priorTotal) * 100,
    });
  }
  channels.sort((a, b) => b.sessions - a.sessions);

  const rows = channels.map((c) => {
    const deltaShare = c.share_pct - c.prior_share_pct;
    const deltaConv = c.conv_rate - c.prior_conv_rate;
    return [
      c.channel,
      formatIndian(c.sessions),
      `${c.share_pct.toFixed(1)}%`,
      `${deltaShare >= 0 ? "+" : ""}${deltaShare.toFixed(1)} pp`,
      `${c.conv_rate.toFixed(2)}%`,
      `${deltaConv >= 0 ? "+" : ""}${deltaConv.toFixed(2)} pp`,
      isPaidChannel(c.channel) ? "paid" : "organic",
    ];
  });

  // LLM interpretation
  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      headline: z.string(),
      callouts: z.array(z.string()).max(3),
      action: z.string(),
    }),
    system: `${baseSystem}\n\nPERSONA: Maya, ${AGENT_MAP.maya.title}. Be terse, opinionated, no fluff.`,
    prompt: `Channel mix for ${range.current.start} → ${range.current.end} vs prior:\n${JSON.stringify(channels.slice(0, 10), null, 2)}\n\nWrite: a 1-sentence headline, up to 3 callouts (use specific numbers + channel names), and 1 action.`,
  });

  return {
    template_id: "channel_mix_health",
    title: "Channel Mix Health",
    subtitle: stripEmojis(interp.object.headline),
    range_label: range.label,
    sections: [
      {
        heading: "Channel grouping (Velir classifier)",
        table: {
          columns: ["Channel", "Sessions", "Share", "Δ Share", "Conv rate", "Δ Conv", "Type"],
          rows,
        },
      },
      {
        heading: "Maya's read",
        bullets: interp.object.callouts.map((c) => ({ text: stripEmojis(c), agent: "maya" })),
      },
      {
        heading: "Action",
        body: stripEmojis(interp.object.action),
      },
    ],
  };
}

// ---------- Funnel Health (real GA4 runFunnelReport) ----------

const D2C_FUNNEL = [
  { name: "View item", eventName: "view_item" },
  { name: "Add to cart", eventName: "add_to_cart" },
  { name: "Begin checkout", eventName: "begin_checkout" },
  { name: "Purchase", eventName: "purchase" },
];
const B2B_FUNNEL = [
  { name: "Page view", eventName: "page_view" },
  { name: "Form start", eventName: "form_start" },
  { name: "Form submit", eventName: "form_submit" },
  { name: "Lead", eventName: "generate_lead" },
];
const APP_FUNNEL = [
  { name: "Session start", eventName: "session_start" },
  { name: "Page view", eventName: "page_view" },
  { name: "Engaged session", eventName: "user_engagement" },
];

async function runFunnelHealth(args: RunArgs): Promise<BriefOutput> {
  const { withTokens, baseSystem, range } = args;
  const first = withTokens.properties[0];

  // Detect which events fire — pick the funnel template with the most coverage.
  const eventScan = await runReport(first.accessToken, first.property.ga4_property_id, {
    dimensions: ["eventName"],
    metrics: ["eventCount"],
    startDate: range.current.start,
    endDate: range.current.end,
    limit: 200,
    orderBy: { metric: "eventCount", desc: true },
  });
  const eventCounts = new Map<string, number>();
  for (const r of eventScan.rows) {
    eventCounts.set(r.dimensions.eventName || "", Number(r.metrics.eventCount || 0));
  }

  function score(steps: typeof D2C_FUNNEL) {
    return steps.filter((s) => (eventCounts.get(s.eventName) ?? 0) > 0).length;
  }
  const choices: Array<{ kind: string; steps: typeof D2C_FUNNEL; score: number }> = [
    { kind: "D2C", steps: D2C_FUNNEL, score: score(D2C_FUNNEL) },
    { kind: "B2B", steps: B2B_FUNNEL, score: score(B2B_FUNNEL) },
    { kind: "App", steps: APP_FUNNEL, score: score(APP_FUNNEL) },
  ];
  choices.sort((a, b) => b.score - a.score);
  const pick = choices[0];
  if (pick.score < 2) {
    return errorOutput(
      "funnel_health",
      "Couldn't detect a funnel — no template has 2+ matching events firing on this property. Set up enhanced measurement or wire ecommerce events first."
    );
  }
  const usableSteps = pick.steps.filter(
    (s) => (eventCounts.get(s.eventName) ?? 0) > 0
  );

  const funnel = await runFunnelReport(first.accessToken, first.property.ga4_property_id, {
    steps: usableSteps,
    startDate: range.current.start,
    endDate: range.current.end,
  });

  if (funnel.steps.length === 0) {
    return errorOutput("funnel_health", "Funnel report returned no rows.");
  }

  // Compute step-to-step drop %s
  const steps = funnel.steps.map((s, i) => {
    const prev = funnel.steps[i - 1];
    const dropPct =
      i === 0 || !prev || prev.active_users === 0
        ? 0
        : ((prev.active_users - s.active_users) / prev.active_users) * 100;
    return { ...s, drop_pct_from_prev: dropPct };
  });
  let worstIdx = 0;
  let worstDrop = 0;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].drop_pct_from_prev > worstDrop) {
      worstDrop = steps[i].drop_pct_from_prev;
      worstIdx = i;
    }
  }

  // LLM hypotheses
  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      headline: z.string(),
      hypotheses: z.array(z.string()).max(3),
      action: z.string(),
    }),
    system: `${baseSystem}\n\nPERSONA: Arjun, ${AGENT_MAP.arjun.title}. Be specific about WHERE the leak is.`,
    prompt: `Funnel (${pick.kind} template, ${range.current.start}→${range.current.end}):\n${JSON.stringify(steps, null, 2)}\n\nWorst drop is between ${steps[worstIdx - 1]?.name ?? "—"} and ${steps[worstIdx].name} (${worstDrop.toFixed(1)}% loss).\n\nWrite: 1 headline, 3 hypotheses for the worst drop, and 1 action.`,
  });

  return {
    template_id: "funnel_health",
    title: "Funnel Health",
    subtitle: stripEmojis(interp.object.headline),
    range_label: `${range.label} · ${pick.kind} template`,
    sections: [
      {
        heading: `Funnel — ${pick.kind} template`,
        funnel: {
          steps: steps.map((s) => ({ label: s.name, count: s.active_users })),
        },
      },
      {
        heading: "Step transitions",
        table: {
          columns: ["Step", "Active users", "Next-step rate", "Drop from prev"],
          rows: steps.map((s) => [
            s.name,
            formatIndian(s.active_users),
            `${(s.next_step_rate * 100).toFixed(1)}%`,
            s.drop_pct_from_prev > 0
              ? `${s.drop_pct_from_prev.toFixed(1)}%`
              : "—",
          ]),
          highlight_rows: [worstIdx],
        },
      },
      {
        heading: "Hypotheses for the worst drop",
        bullets: interp.object.hypotheses.map((h) => ({ text: stripEmojis(h), agent: "arjun" })),
      },
      {
        heading: "Action",
        body: stripEmojis(interp.object.action),
      },
    ],
  };
}

// ---------- Attribution Comparison (first-click vs last-click) ----------

async function runAttributionComparison(args: RunArgs): Promise<BriefOutput> {
  const { withTokens, baseSystem, range } = args;
  const first = withTokens.properties[0];

  // keyEvents and conversions are synonyms in GA4 — never request both.
  async function pull(dim: string) {
    const tryFetch = async (metrics: string[]) =>
      runReport(first.accessToken, first.property.ga4_property_id, {
        dimensions: [dim],
        metrics,
        startDate: range.current.start,
        endDate: range.current.end,
        limit: 50,
        orderBy: { metric: "sessions", desc: true },
      });
    try {
      return await tryFetch(["sessions", "keyEvents", "totalRevenue"]);
    } catch {
      return await tryFetch(["sessions", "conversions", "totalRevenue"]);
    }
  }
  const [firstUser, session] = await Promise.all([
    pull("firstUserDefaultChannelGroup"),
    pull("sessionDefaultChannelGroup"),
  ]);

  type Agg = { sessions: number; conv: number; rev: number };
  function pickConv(metrics: Record<string, string>): number {
    // Prefer keyEvents (GA4's current canonical), fall back to conversions.
    const ke = Number(metrics.keyEvents || 0);
    if (ke > 0) return ke;
    return Number(metrics.conversions || 0);
  }
  const firstByCh = new Map<string, Agg>();
  for (const r of firstUser.rows) {
    firstByCh.set(r.dimensions.firstUserDefaultChannelGroup || "(unknown)", {
      sessions: Number(r.metrics.sessions || 0),
      conv: pickConv(r.metrics),
      rev: Number(r.metrics.totalRevenue || 0),
    });
  }
  const lastByCh = new Map<string, Agg>();
  for (const r of session.rows) {
    lastByCh.set(r.dimensions.sessionDefaultChannelGroup || "(unknown)", {
      sessions: Number(r.metrics.sessions || 0),
      conv: pickConv(r.metrics),
      rev: Number(r.metrics.totalRevenue || 0),
    });
  }

  if (firstByCh.size === 0 && lastByCh.size === 0) {
    return errorOutput(
      "attribution_comparison",
      `No channel data returned for ${range.current.start} → ${range.current.end}. Check that the GA4 property has traffic in this window and that channel-group dimensions are populated.`
    );
  }

  const allCh = new Set<string>([...firstByCh.keys(), ...lastByCh.keys()]);
  type Row = {
    channel: string;
    first_sessions: number;
    last_sessions: number;
    first_conv: number;
    last_conv: number;
    delta_conv_pct: number;
    delta_sessions_pct: number;
  };
  const rows: Row[] = [];
  for (const ch of allCh) {
    const f = firstByCh.get(ch) ?? { sessions: 0, conv: 0, rev: 0 };
    const l = lastByCh.get(ch) ?? { sessions: 0, conv: 0, rev: 0 };
    const deltaConv =
      f.conv > 0 ? ((l.conv - f.conv) / f.conv) * 100 : l.conv > 0 ? 100 : 0;
    const deltaSessions =
      f.sessions > 0
        ? ((l.sessions - f.sessions) / f.sessions) * 100
        : l.sessions > 0
        ? 100
        : 0;
    rows.push({
      channel: ch,
      first_sessions: f.sessions,
      last_sessions: l.sessions,
      first_conv: f.conv,
      last_conv: l.conv,
      delta_conv_pct: deltaConv,
      delta_sessions_pct: deltaSessions,
    });
  }
  const totalConv = rows.reduce((s, r) => s + r.first_conv + r.last_conv, 0);
  const hasConversions = totalConv > 0;
  rows.sort(
    hasConversions
      ? (a, b) => Math.abs(b.delta_conv_pct) - Math.abs(a.delta_conv_pct)
      : (a, b) => Math.abs(b.delta_sessions_pct) - Math.abs(a.delta_sessions_pct)
  );

  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      headline: z.string(),
      overcredited: z.array(z.string()).max(3),
      undercredited: z.array(z.string()).max(3),
      action: z.string(),
    }),
    system: `${baseSystem}\n\nYou are a paid-vs-organic attribution analyst. First-click credits the acquisition channel; last-click credits the channel that closed. Channels with last >> first are "over-credited on last-click" (closers); channels with first >> last are "under-credited on last-click" (openers).${
      hasConversions
        ? ""
        : " NOTE: this property has zero conversions in the window — analyze sessions instead and call out that the acquisition vs closing patterns are based on traffic flow, not converted revenue."
    }`,
    prompt: `Per channel for ${range.current.start} → ${range.current.end} (${
      hasConversions ? "with conversions" : "sessions only — no conversions configured/firing"
    }):\n${JSON.stringify(rows.slice(0, 12), null, 2)}\n\nReturn: 1 headline, up to 3 over-credited channels (name + numbers), up to 3 under-credited, and 1 action.`,
  });

  return {
    template_id: "attribution_comparison",
    title: "Attribution Comparison",
    subtitle: stripEmojis(interp.object.headline),
    range_label: `${range.label}${hasConversions ? "" : " · sessions only"}`,
    sections: [
      {
        heading: "First-click vs last-click per channel",
        table: hasConversions
          ? {
              columns: [
                "Channel",
                "First-click conv",
                "Last-click conv",
                "Δ conv %",
                "First sessions",
                "Last sessions",
              ],
              rows: rows.slice(0, 15).map((r) => [
                r.channel,
                formatIndian(r.first_conv),
                formatIndian(r.last_conv),
                `${r.delta_conv_pct >= 0 ? "+" : ""}${r.delta_conv_pct.toFixed(1)}%`,
                formatIndian(r.first_sessions),
                formatIndian(r.last_sessions),
              ]),
            }
          : {
              columns: [
                "Channel",
                "First-click sessions",
                "Last-click sessions",
                "Δ sessions %",
              ],
              rows: rows.slice(0, 15).map((r) => [
                r.channel,
                formatIndian(r.first_sessions),
                formatIndian(r.last_sessions),
                `${r.delta_sessions_pct >= 0 ? "+" : ""}${r.delta_sessions_pct.toFixed(1)}%`,
              ]),
            },
      },
      {
        heading: "Over-credited on last-click (closers)",
        bullets: interp.object.overcredited.map((t) => ({ text: stripEmojis(t), agent: "maya" })),
      },
      {
        heading: "Under-credited on last-click (openers)",
        bullets: interp.object.undercredited.map((t) => ({ text: stripEmojis(t), agent: "kabir" })),
      },
      {
        heading: "Action",
        body: stripEmojis(interp.object.action),
      },
    ],
  };
}

// ---------- Cohort Retention ----------

async function runCohortRetention(args: RunArgs): Promise<BriefOutput> {
  const { withTokens, baseSystem, range } = args;
  const first = withTokens.properties[0];

  // GA4 cohort report — we run it as a regular report with cohortNthWeek
  // dimension. Cohort spec needs to be passed in the body, so we use a custom
  // fetch (the wrapper doesn't yet support cohortSpec).
  type CohortRow = {
    cohort: string;
    cohortNthWeek: number;
    activeUsers: number;
  };
  const cohortResp = await runCohortReport(
    first.accessToken,
    first.property.ga4_property_id,
    {
      cohortGranularity: "WEEKLY",
      cohortCount: 8,
      startEndOffset: "first_touch",
    }
  );
  const rows: CohortRow[] = cohortResp.rows;
  if (rows.length === 0) {
    return errorOutput(
      "cohort_retention",
      "Cohort report returned no rows. Property may be too new (need 4+ weeks of data)."
    );
  }

  // pivot: { cohort -> { week -> users } }
  const byCohort = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const m = byCohort.get(r.cohort) ?? new Map<number, number>();
    m.set(r.cohortNthWeek, r.activeUsers);
    byCohort.set(r.cohort, m);
  }
  const cohortKeys = [...byCohort.keys()].sort();
  const maxWeek = Math.max(...rows.map((r) => r.cohortNthWeek));
  const columns = ["Cohort", ...Array.from({ length: maxWeek + 1 }, (_, i) => `W${i}`)];
  const tableRows = cohortKeys.map((c) => {
    const m = byCohort.get(c)!;
    const base = m.get(0) ?? 0;
    return [
      c,
      ...Array.from({ length: maxWeek + 1 }, (_, w) => {
        const v = m.get(w) ?? 0;
        if (w === 0) return formatIndian(v);
        const pct = base > 0 ? (v / base) * 100 : 0;
        return v > 0 ? `${pct.toFixed(1)}%` : "—";
      }),
    ];
  });

  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      headline: z.string(),
      stickiest: z.string(),
      churniest: z.string(),
      action: z.string(),
    }),
    system: `${baseSystem}\n\nPERSONA: Raavi, ${AGENT_MAP.raavi.title}. Statistical lens.`,
    prompt: `Weekly acquisition cohorts. Rows: cohort start week. Columns: W0 (base size), W1..Wn (retention % of base):\n${JSON.stringify(
      tableRows.slice(0, 8),
      null,
      2
    )}\n\nReturn: 1 headline, 1 sentence on the stickiest cohort, 1 sentence on the churniest, and 1 action.`,
  });

  return {
    template_id: "cohort_retention",
    title: "Cohort Retention",
    subtitle: stripEmojis(interp.object.headline),
    range_label: `Last ${cohortKeys.length} weekly cohorts`,
    sections: [
      {
        heading: "Weekly retention matrix",
        table: { columns, rows: tableRows },
      },
      {
        heading: "Stickiest cohort",
        body: stripEmojis(interp.object.stickiest),
      },
      {
        heading: "Churniest cohort",
        body: stripEmojis(interp.object.churniest),
      },
      {
        heading: "Action",
        body: stripEmojis(interp.object.action),
      },
    ],
  };
}

// Minimal cohort-report helper (the `runReport` wrapper doesn't accept cohortSpec).
async function runCohortReport(
  accessToken: string,
  propertyId: string,
  args: { cohortGranularity: "DAILY" | "WEEKLY" | "MONTHLY"; cohortCount: number; startEndOffset: string }
): Promise<{ rows: Array<{ cohort: string; cohortNthWeek: number; activeUsers: number }> }> {
  void args.startEndOffset;
  // Build N cohorts ending today
  const today = new Date();
  function fmt(d: Date) {
    return d.toISOString().slice(0, 10);
  }
  const cohorts = [];
  for (let i = args.cohortCount - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    cohorts.push({
      // GA4 forbids cohort names beginning with "cohort_" — use a non-reserved prefix.
      name: `wk${args.cohortCount - 1 - i}`,
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
        granularity: args.cohortGranularity,
        startOffset: 0,
        endOffset: args.cohortCount - 1,
      },
    },
    dimensions: [{ name: "cohort" }, { name: "cohortNthWeek" }],
    metrics: [{ name: "cohortActiveUsers" }],
  };
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
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
    throw new Error(`cohort runReport HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  type Resp = {
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
  };
  const data = (await res.json()) as Resp;
  const out: Array<{ cohort: string; cohortNthWeek: number; activeUsers: number }> = [];
  for (const r of data.rows || []) {
    const cohortName = r.dimensionValues?.[0]?.value ?? "";
    const nth = parseInt(r.dimensionValues?.[1]?.value ?? "0", 10);
    const users = Number(r.metricValues?.[0]?.value ?? 0);
    const meta = cohorts.find((c) => c.name === cohortName);
    out.push({
      cohort: meta?.label ?? cohortName,
      cohortNthWeek: nth,
      activeUsers: users,
    });
  }
  return { rows: out };
}

// ---------- Landing Page Health ----------

async function runLandingPageHealth(args: RunArgs): Promise<BriefOutput> {
  const { withTokens, baseSystem, range } = args;
  const first = withTokens.properties[0];
  // keyEvents and conversions are synonyms — never request both.
  async function pullReport(metrics: string[]) {
    return runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["landingPagePlusQueryString"],
      metrics,
      startDate: range.current.start,
      endDate: range.current.end,
      limit: 200,
      orderBy: { metric: "sessions", desc: true },
    });
  }
  let report;
  try {
    report = await pullReport(["sessions", "engagementRate", "bounceRate", "keyEvents"]);
  } catch {
    report = await pullReport(["sessions", "engagementRate", "bounceRate", "conversions"]);
  }
  if (report.rows.length === 0) {
    return errorOutput("landing_page_health", "No landing page data for this period.");
  }

  // Compute per-page conversion rate. Filter to pages with ≥ totalSessions/500 traffic.
  const total = report.rows.reduce((s, r) => s + Number(r.metrics.sessions || 0), 0);
  const minTraffic = Math.max(50, Math.floor(total / 500));
  type Page = {
    path: string;
    sessions: number;
    engagement_rate: number;
    bounce_rate: number;
    conv_rate: number;
  };
  const pages: Page[] = report.rows
    .map((r) => {
      const sessions = Number(r.metrics.sessions || 0);
      const ke = Number(r.metrics.keyEvents || 0);
      const convCount = ke > 0 ? ke : Number(r.metrics.conversions || 0);
      return {
        path: r.dimensions.landingPagePlusQueryString || "(not set)",
        sessions,
        engagement_rate: Number(r.metrics.engagementRate || 0) * 100,
        bounce_rate: Number(r.metrics.bounceRate || 0) * 100,
        conv_rate: sessions > 0 ? (convCount / sessions) * 100 : 0,
      };
    })
    .filter((p) => p.sessions >= minTraffic);

  const top = [...pages].sort((a, b) => b.conv_rate - a.conv_rate).slice(0, 10);
  const bottom = [...pages].sort((a, b) => a.conv_rate - b.conv_rate).slice(0, 10);

  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      headline: z.string(),
      copy_winners_to: z.array(z.string()).max(2),
      action: z.string(),
    }),
    system: `${baseSystem}\n\nPERSONA: Arjun, content & landing-page specialist.`,
    prompt: `Top 10 by conv rate:\n${JSON.stringify(top, null, 2)}\n\nBottom 10 (still ≥ ${minTraffic} sessions):\n${JSON.stringify(bottom, null, 2)}\n\nReturn 1 headline, up to 2 callouts (e.g. "copy what /pricing does to /features"), and 1 action.`,
  });

  function fmtRow(p: Page) {
    return [
      p.path,
      formatIndian(p.sessions),
      `${p.engagement_rate.toFixed(1)}%`,
      `${p.bounce_rate.toFixed(1)}%`,
      `${p.conv_rate.toFixed(2)}%`,
    ];
  }

  return {
    template_id: "landing_page_health",
    title: "Landing Page Health",
    subtitle: stripEmojis(interp.object.headline),
    range_label: `${range.label} · min ${formatIndian(minTraffic)} sessions`,
    sections: [
      {
        heading: "Top 10 by conversion rate",
        table: {
          columns: ["Page", "Sessions", "Engagement", "Bounce", "Conv rate"],
          rows: top.map(fmtRow),
        },
      },
      {
        heading: "Bottom 10 by conversion rate",
        table: {
          columns: ["Page", "Sessions", "Engagement", "Bounce", "Conv rate"],
          rows: bottom.map(fmtRow),
        },
      },
      {
        heading: "Arjun's read",
        bullets: interp.object.copy_winners_to.map((t) => ({
          text: stripEmojis(t),
          agent: "arjun",
        })),
      },
      {
        heading: "Action",
        body: stripEmojis(interp.object.action),
      },
    ],
  };
}

// Indian-numbering formatter shared by new briefs.
function formatIndian(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-IN");
}

// ---------- Weekly Performance Marketing (Vera) ----------

async function runWeeklyPaidMarketing(args: RunArgs): Promise<BriefOutput> {
  const { ws, withTokens, baseSystem, range } = args;
  const ads = workspaceAdsCustomers(ws as never as import("@/lib/db").WorkspaceRow);
  // Detect Ads readiness
  const { isGoogleAdsConfigured, runGaql } = await import("@/lib/sources/google_ads/api");
  if (!isGoogleAdsConfigured()) {
    return errorOutput(
      "weekly_paid_marketing",
      "Google Ads not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN in .env.local and restart."
    );
  }
  if (ads.length === 0) {
    return errorOutput(
      "weekly_paid_marketing",
      "No Google Ads accounts attached to this workspace. Connect one on /workspace."
    );
  }

  const first = withTokens.properties[0];
  const userId = ws.user_id as number;

  // Ads per-campaign for current + prior period
  type AdsCampaign = {
    campaign: string;
    spend: number;
    spend_prev: number;
    clicks: number;
    ads_conversions: number;
    conv_value: number;
  };
  const byCamp = new Map<string, AdsCampaign>();
  await Promise.all(
    ads.map(async (c) => {
      for (const [phase, gaqlRange] of [
        ["current", "LAST_7_DAYS"],
        ["prior", "LAST_14_DAYS"],
      ] as const) {
        try {
          const rows = (await runGaql({
            userId,
            customerId: c.source_id,
            query: `SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING ${gaqlRange}`,
          })) as Array<{
            campaign?: { name?: string };
            metrics?: {
              cost_micros?: string | number;
              clicks?: string | number;
              conversions?: string | number;
              conversions_value?: string | number;
            };
          }>;
          for (const row of rows) {
            const name = row.campaign?.name || "(unnamed)";
            const k = name.toLowerCase();
            const existing =
              byCamp.get(k) ?? {
                campaign: name,
                spend: 0,
                spend_prev: 0,
                clicks: 0,
                ads_conversions: 0,
                conv_value: 0,
              };
            const cost = Number(row.metrics?.cost_micros || 0) / 1_000_000;
            if (phase === "current") {
              existing.spend += cost;
              existing.clicks += Number(row.metrics?.clicks || 0);
              existing.ads_conversions += Number(row.metrics?.conversions || 0);
              existing.conv_value += Number(row.metrics?.conversions_value || 0);
            } else {
              // LAST_14_DAYS includes current week — subtract later
              existing.spend_prev += cost;
            }
            byCamp.set(k, existing);
          }
        } catch (err) {
          console.warn("[weekly_paid] customer failed:", (err as Error).message);
        }
      }
    })
  );
  // Convert spend_prev (LAST_14) to true prior-7 by subtracting current
  for (const v of byCamp.values()) v.spend_prev = Math.max(0, v.spend_prev - v.spend);

  // GA4 per-campaign for current
  let ga4;
  try {
    ga4 = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionCampaignName"],
      metrics: ["sessions", "keyEvents", "totalRevenue"],
      startDate: range.current.start,
      endDate: range.current.end,
      limit: 500,
    });
  } catch {
    ga4 = await runReport(first.accessToken, first.property.ga4_property_id, {
      dimensions: ["sessionCampaignName"],
      metrics: ["sessions", "conversions", "totalRevenue"],
      startDate: range.current.start,
      endDate: range.current.end,
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

  const joined = [...byCamp.values()]
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
      const wow_spend =
        a.spend_prev > 0 ? ((a.spend - a.spend_prev) / a.spend_prev) * 100 : null;
      return { ...a, ga4_sessions: g.sessions, ga4_conv: g.conv, ga4_rev: g.rev, gap, cac, roas, wow_spend };
    })
    .sort((a, b) => b.spend - a.spend);

  const totals = {
    spend: joined.reduce((s, c) => s + c.spend, 0),
    spend_prev: joined.reduce((s, c) => s + c.spend_prev, 0),
    ads_conv: joined.reduce((s, c) => s + c.ads_conversions, 0),
    ga4_conv: joined.reduce((s, c) => s + c.ga4_conv, 0),
    ga4_rev: joined.reduce((s, c) => s + c.ga4_rev, 0),
  };
  const blended_roas = totals.spend > 0 ? totals.ga4_rev / totals.spend : 0;
  const real_cac = totals.ga4_conv > 0 ? totals.spend / totals.ga4_conv : null;

  // Vera writes the synthesis.
  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      headline: z.string(),
      whats_scaling: z.array(z.string()).max(3),
      whats_bleeding: z.array(z.string()).max(3),
      budget_shifts: z
        .array(
          z.object({
            from: z.string(),
            to: z.string(),
            amount: z.string(),
            rationale: z.string(),
          })
        )
        .max(3),
    }),
    system: `${baseSystem}\n\nPERSONA: Vera, ${AGENT_MAP.vera.title}. ${AGENT_MAP.vera.systemPromptAddendum}`,
    prompt: `Weekly paid roll-up. Range: ${range.current.start} → ${range.current.end} vs ${range.prior.start} → ${range.prior.end}.\n\nTotals (current): spend ₹${formatIndian(totals.spend)}, Ads-reported conv ${formatIndian(totals.ads_conv)}, GA4-attributed conv ${formatIndian(totals.ga4_conv)}, GA4 revenue ₹${formatIndian(totals.ga4_rev)}, blended ROAS ${blended_roas.toFixed(2)}x, real CAC ${real_cac == null ? "—" : "₹" + real_cac.toFixed(0)}.\n\nCampaigns (top 15 by spend, joined):\n${JSON.stringify(joined.slice(0, 15), null, 2)}\n\nReturn: 1 headline, up to 3 \`whats_scaling\` callouts, up to 3 \`whats_bleeding\` callouts (with specific rupee figures), and up to 3 concrete budget_shifts (each with from-campaign, to-campaign, amount in ₹, and one-line rationale).`,
  });

  const tableRows = joined.slice(0, 15).map((c) => [
    c.campaign,
    `₹${formatIndian(c.spend)}`,
    c.wow_spend == null ? "—" : `${c.wow_spend >= 0 ? "+" : ""}${c.wow_spend.toFixed(1)}%`,
    formatIndian(c.ads_conversions),
    formatIndian(c.ga4_conv),
    `${c.gap.toFixed(1)}%`,
    c.cac == null ? "—" : `₹${c.cac.toFixed(0)}`,
    c.roas == null ? "—" : `${c.roas.toFixed(2)}x`,
  ]);

  return {
    template_id: "weekly_paid_marketing",
    title: "Weekly Performance Marketing",
    subtitle: stripEmojis(interp.object.headline),
    range_label: `${range.label} · ${ads.length} Ads ${ads.length === 1 ? "account" : "accounts"}`,
    sections: [
      {
        heading: "Headline numbers",
        kpis: [
          {
            label: "Spend",
            value: `₹${formatIndian(totals.spend)}`,
            change_pct:
              totals.spend_prev > 0
                ? ((totals.spend - totals.spend_prev) / totals.spend_prev) * 100
                : undefined,
            change_direction:
              totals.spend_prev > 0
                ? totals.spend > totals.spend_prev
                  ? "up"
                  : "down"
                : "flat",
          },
          { label: "Blended ROAS", value: `${blended_roas.toFixed(2)}x` },
          { label: "Real CAC", value: real_cac == null ? "—" : `₹${real_cac.toFixed(0)}` },
          {
            label: "Attribution gap",
            value:
              totals.ads_conv > 0
                ? `${(((totals.ads_conv - totals.ga4_conv) / totals.ads_conv) * 100).toFixed(1)}%`
                : "—",
          },
        ],
      },
      {
        heading: "Per-campaign reality check",
        table: {
          columns: [
            "Campaign",
            "Spend",
            "Spend Δ vs prior",
            "Ads conv",
            "GA4 conv",
            "Gap %",
            "Real CAC",
            "ROAS",
          ],
          rows: tableRows,
        },
      },
      {
        heading: "What's scaling",
        bullets: interp.object.whats_scaling.map((t) => ({ text: stripEmojis(t), agent: "vera" })),
      },
      {
        heading: "What's bleeding",
        bullets: interp.object.whats_bleeding.map((t) => ({ text: stripEmojis(t), agent: "vera" })),
      },
      {
        heading: "Recommended budget shifts",
        bullets: interp.object.budget_shifts.map((s) => ({
          text: stripEmojis(
            `**${s.amount}** — move from ${s.from} → ${s.to}. ${s.rationale}`
          ),
          agent: "vera",
        })),
      },
    ],
  };
}

// ---------- Wasted Spend Audit (Vera) ----------

async function runWastedSpendAudit(args: RunArgs): Promise<BriefOutput> {
  const { ws, baseSystem, range } = args;
  void range;
  const ads = workspaceAdsCustomers(ws as never as import("@/lib/db").WorkspaceRow);
  const { isGoogleAdsConfigured, runGaql } = await import("@/lib/sources/google_ads/api");
  if (!isGoogleAdsConfigured()) {
    return errorOutput(
      "wasted_spend_audit",
      "Google Ads not configured. Set GOOGLE_ADS_DEVELOPER_TOKEN in .env.local and restart."
    );
  }
  if (ads.length === 0) {
    return errorOutput(
      "wasted_spend_audit",
      "No Google Ads accounts attached. Connect one on /workspace."
    );
  }

  const userId = ws.user_id as number;
  // Negative keyword candidates: search terms with >100 clicks and zero conv
  type Term = { term: string; campaign: string; spend: number; clicks: number };
  const terms: Term[] = [];
  await Promise.all(
    ads.map(async (c) => {
      try {
        const rows = (await runGaql({
          userId,
          customerId: c.source_id,
          query: `SELECT search_term_view.search_term, campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS AND metrics.clicks > 100 AND metrics.conversions = 0 ORDER BY metrics.cost_micros DESC LIMIT 60`,
        })) as Array<{
          search_term_view?: { search_term?: string };
          campaign?: { name?: string };
          metrics?: {
            cost_micros?: string | number;
            clicks?: string | number;
          };
        }>;
        for (const row of rows) {
          terms.push({
            term: row.search_term_view?.search_term || "(unset)",
            campaign: row.campaign?.name || "(unnamed)",
            spend: Number(row.metrics?.cost_micros || 0) / 1_000_000,
            clicks: Number(row.metrics?.clicks || 0),
          });
        }
      } catch {
        /* skip */
      }
    })
  );
  terms.sort((a, b) => b.spend - a.spend);

  // High-spend low-CTR ad variants
  type AdRow = { ad_id: string; ad_group: string; impressions: number; clicks: number; ctr: number; spend: number };
  const lowCtrAds: AdRow[] = [];
  await Promise.all(
    ads.map(async (c) => {
      try {
        const rows = (await runGaql({
          userId,
          customerId: c.source_id,
          query: `SELECT ad_group_ad.ad.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros FROM ad_group_ad WHERE segments.date DURING LAST_30_DAYS AND metrics.impressions > 1000 ORDER BY metrics.ctr ASC LIMIT 30`,
        })) as Array<{
          ad_group_ad?: { ad?: { id?: string } };
          ad_group?: { name?: string };
          metrics?: {
            impressions?: string | number;
            clicks?: string | number;
            ctr?: string | number;
            cost_micros?: string | number;
          };
        }>;
        for (const row of rows) {
          lowCtrAds.push({
            ad_id: String(row.ad_group_ad?.ad?.id || "?"),
            ad_group: row.ad_group?.name || "(unset)",
            impressions: Number(row.metrics?.impressions || 0),
            clicks: Number(row.metrics?.clicks || 0),
            ctr: Number(row.metrics?.ctr || 0),
            spend: Number(row.metrics?.cost_micros || 0) / 1_000_000,
          });
        }
      } catch {
        /* skip */
      }
    })
  );

  const totalWasted = terms.reduce((s, t) => s + t.spend, 0);

  const interp = await generateObject({
    model: trackedModel("claude-sonnet-4-6", "brief"),
    schema: z.object({
      headline: z.string(),
      summary: z.string(),
      paste_block: z.string().describe("Negative keywords formatted as a copy-paste list, one per line."),
    }),
    system: `${baseSystem}\n\nPERSONA: Vera, ${AGENT_MAP.vera.title}. ${AGENT_MAP.vera.systemPromptAddendum}`,
    prompt: `Audit. Negative keyword candidates (search terms, >100 clicks, zero conv, last 30 days). Total wasted spend: ₹${formatIndian(totalWasted)}.\n\nTop terms:\n${JSON.stringify(terms.slice(0, 30), null, 2)}\n\nReturn: 1 headline, 2-3 sentence summary, plus a paste_block of the top 15 negative-keyword candidates formatted one per line for direct paste into Google Ads.`,
  });

  return {
    template_id: "wasted_spend_audit",
    title: "Wasted Spend Audit",
    subtitle: stripEmojis(interp.object.headline),
    range_label: "Last 30 days",
    sections: [
      {
        heading: "Vera's read",
        body: stripEmojis(interp.object.summary),
      },
      {
        heading: `Negative keyword candidates (₹${formatIndian(totalWasted)} wasted)`,
        table: {
          columns: ["Search term", "Campaign", "Spend", "Clicks"],
          rows: terms.slice(0, 25).map((t) => [
            t.term,
            t.campaign,
            `₹${formatIndian(t.spend)}`,
            formatIndian(t.clicks),
          ]),
        },
      },
      {
        heading: "Copy-paste list",
        body: stripEmojis(interp.object.paste_block),
      },
      ...(lowCtrAds.length > 0
        ? [
            {
              heading: "Low-CTR ad variants to consider pausing",
              table: {
                columns: ["Ad ID", "Ad Group", "Impressions", "CTR", "Spend"],
                rows: lowCtrAds.slice(0, 15).map((a) => [
                  a.ad_id,
                  a.ad_group,
                  formatIndian(a.impressions),
                  `${(a.ctr * 100).toFixed(2)}%`,
                  `₹${formatIndian(a.spend)}`,
                ]),
              },
            } as BriefSection,
          ]
        : []),
    ],
  };
}

void briefOutputSchema;

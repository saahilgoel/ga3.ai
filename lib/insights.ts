import { generateObject } from "ai";
import { z } from "zod";
import { trackedModel } from "@/lib/usage/anthropic";
import { BUSINESS_TYPE_LABEL } from "@/lib/business-type";
import type { DashboardResponse } from "@/lib/dashboard";

// An expert insight card. The NUMBERS (title/finding) are computed
// deterministically from GA4 data so they're always accurate; the LLM adds the
// "why" (with an expert benchmark), the recommendation, and an investigate prompt.
export type InsightKind = "anomaly" | "opportunity" | "risk" | "benchmark" | "win";

export type InsightCard = {
  id: string;
  kind: InsightKind;
  title: string;
  finding: string;
  why: string;
  recommendation: string;
  ask: string;
  priority: number;
};

type Signal = { id: string; title: string; finding: string; note: string };

// ---- formatting (Indian numbering) ----
function fmtN(n: number): string {
  const v = Math.round(n);
  if (Math.abs(v) >= 1_00_00_000) return `${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1_00_000) return `${(v / 1_00_000).toFixed(2)} L`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}
function pct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ---- deterministic signal pool from the dashboard data ----
function computeSignals(d: DashboardResponse, businessType?: string): Signal[] {
  const s: Signal[] = [];
  const kpi = d.kpi;

  // 1) Biggest mover
  const movers = (
    [
      ["Sessions", kpi.sessions],
      ["Users", kpi.users],
      ["Engagement rate", kpi.engagement_rate],
      ["Conversions", kpi.conversions],
    ] as const
  )
    .filter(([, k]) => k.delta_pct != null)
    .sort((a, b) => Math.abs(b[1].delta_pct!) - Math.abs(a[1].delta_pct!));
  if (movers[0]) {
    const [name, k] = movers[0];
    s.push({
      id: "mover",
      title: `${name} ${k.delta_pct! >= 0 ? "up" : "down"} ${pct(k.delta_pct!).replace("+", "")}`,
      finding: `${name} is ${pct(k.delta_pct!)} vs the prior period (now ${fmtN(k.current)}).`,
      note: "biggest period-over-period change",
    });
  }

  // 2) Conversion-rate sanity
  if (kpi.sessions.current > 0) {
    const cr = (kpi.conversions.current / kpi.sessions.current) * 100;
    s.push(
      cr > 50
        ? {
            id: "conv_config",
            title: `Conversion rate reads ${cr.toFixed(0)}%`,
            finding: `Reported conversion rate is ${cr.toFixed(1)}% (${fmtN(kpi.conversions.current)} key events / ${fmtN(kpi.sessions.current)} sessions).`,
            note: "implausibly high — almost certainly a key-event config issue, not a real rate",
          }
        : {
            id: "conv_rate",
            title: `Conversion rate ${cr.toFixed(1)}%`,
            finding: `Conversion rate is ${cr.toFixed(1)}% (${fmtN(kpi.conversions.current)} conversions on ${fmtN(kpi.sessions.current)} sessions).`,
            note: "compare to typical range for this business type",
          }
    );
  }

  // 3) Mobile vs desktop gap
  const dm = d.device_mix?.rows ?? [];
  const mob = dm.find((r) => r.device === "mobile");
  const desk = dm.find((r) => r.device === "desktop");
  if (mob && desk && mob.share_pct >= 25 && desk.conversion_rate > 0) {
    const gap = desk.conversion_rate - mob.conversion_rate;
    if (gap > desk.conversion_rate * 0.15) {
      const lost = mob.sessions * (gap / 100);
      s.push({
        id: "mobile_gap",
        title: `Mobile converts ${mob.conversion_rate.toFixed(1)}% vs ${desk.conversion_rate.toFixed(1)}% desktop`,
        finding: `Mobile is ${mob.share_pct.toFixed(0)}% of sessions but converts at ${mob.conversion_rate.toFixed(1)}% vs ${desk.conversion_rate.toFixed(1)}% on desktop — about ${fmtN(lost)} conversions/period at desktop parity.`,
        note: "mobile UX / checkout opportunity, sized in lost conversions",
      });
    }
  }

  // 4) Channel quality (best vs worst by conversion rate among meaningful channels)
  const chans = (d.top_channels ?? []).filter((c) => c.sessions >= 30);
  if (chans.length >= 2) {
    const withCr = chans.map((c) => ({ ...c, cr: c.sessions > 0 ? (c.conversions / c.sessions) * 100 : 0 }));
    const best = [...withCr].sort((a, b) => b.cr - a.cr)[0];
    const worst = [...withCr].sort((a, b) => a.cr - b.cr)[0];
    if (best && worst && best.channel !== worst.channel) {
      s.push({
        id: "channel_quality",
        title: `${best.channel} converts ${best.cr.toFixed(1)}%, ${worst.channel} ${worst.cr.toFixed(1)}%`,
        finding: `${best.channel} converts best at ${best.cr.toFixed(1)}%; ${worst.channel} sends ${worst.share_pct.toFixed(0)}% of traffic but converts at only ${worst.cr.toFixed(1)}%.`,
        note: "where to shift spend/attention — quality over volume",
      });
    }
  }

  // 5) Source concentration risk
  const top = d.top_channels?.[0];
  if (top && top.share_pct >= 40) {
    s.push({
      id: "source_risk",
      title: `${top.channel} is ${top.share_pct.toFixed(0)}% of traffic`,
      finding: `${top.channel} drives ${top.share_pct.toFixed(0)}% of all sessions — a single algorithm, policy or attribution change could swing the whole top line.`,
      note: "concentration risk; also consider attribution gaps if it's Direct/Unassigned",
    });
  }

  // 6) Funnel leak (from the tailored funnel)
  const f = d.tailored?.funnel;
  if (f && f.steps.length >= 2) {
    let worstDrop = -1;
    let pair: { a: { name: string; value: number }; b: { name: string; value: number }; drop: number } | null = null;
    for (let i = 1; i < f.steps.length; i++) {
      const a = f.steps[i - 1];
      const b = f.steps[i];
      if (a.value > 0) {
        const drop = (1 - b.value / a.value) * 100;
        if (drop > worstDrop) {
          worstDrop = drop;
          pair = { a, b, drop };
        }
      }
    }
    if (pair && pair.drop > 0) {
      s.push({
        id: "funnel_leak",
        title: `${pair.a.name}→${pair.b.name} loses ${pair.drop.toFixed(0)}%`,
        finding: `In your ${f.title.toLowerCase()}, the biggest leak is ${pair.a.name}→${pair.b.name}: ${pair.drop.toFixed(0)}% drop (${fmtN(pair.a.value)}→${fmtN(pair.b.value)}).`,
        note: "the highest-leverage step to fix",
      });
    }
  }

  // 7) Tailored leader (top product / content)
  const list = d.tailored?.list;
  if (list && list.rows[0]) {
    s.push({
      id: "leader",
      title: `${list.rows[0].name} leads`,
      finding: `${list.title}: ${list.rows[0].name} is on top at ${list.format === "currency" ? "₹" : ""}${fmtN(list.rows[0].value)}.`,
      note: "your standout — lean into it or protect it",
    });
  }

  // 8) Geography concentration
  const geo = d.top_geography?.rows ?? [];
  const geoTotal = geo.reduce((a, r) => a + r.sessions, 0);
  if (geo[0] && geoTotal > 0) {
    const share = (geo[0].sessions / geoTotal) * 100;
    s.push({
      id: "geo",
      title: `${geo[0].name} is ${share.toFixed(0)}% of traffic`,
      finding: `Top ${d.top_geography.granularity}: ${geo[0].name} at ${share.toFixed(0)}% of sessions (${fmtN(geo[0].sessions)}).`,
      note: "geographic concentration / expansion angle",
    });
  }

  // 9) Engagement quality trend
  if (kpi.engagement_rate.delta_pct != null) {
    s.push({
      id: "engagement",
      title: `Engagement rate ${kpi.engagement_rate.current.toFixed(1)}%`,
      finding: `Engagement rate is ${kpi.engagement_rate.current.toFixed(1)}% (${pct(kpi.engagement_rate.delta_pct)} vs prior).`,
      note: "quality-of-traffic signal",
    });
  }

  // 10) Tailored KPI highlight (type-specific — e.g. AOV, stickiness)
  const tk = d.tailored?.kpis ?? [];
  const highlight = tk.find((k) => ["aov", "stickiness", "mau", "leads", "returning", "revenue"].includes(k.key));
  if (highlight) {
    const val = highlight.format === "currency" ? `₹${fmtN(highlight.value)}` : highlight.format === "percent" ? `${highlight.value.toFixed(1)}%` : fmtN(highlight.value);
    s.push({
      id: `tailored_${highlight.key}`,
      title: `${highlight.label}: ${val}`,
      finding: `${highlight.label} for this period is ${val}.`,
      note: "headline metric for this business type — benchmark it against best-in-class",
    });
  }

  // 11) Traffic trajectory (first third vs last third of the series)
  const series = d.traffic_over_time?.series ?? [];
  if (series.length >= 6) {
    const third = Math.floor(series.length / 3);
    const head = series.slice(0, third);
    const tail = series.slice(-third);
    const avg = (xs: typeof series) => xs.reduce((a, r) => a + r.sessions, 0) / Math.max(1, xs.length);
    const h = avg(head);
    const t = avg(tail);
    if (h > 0) {
      const change = ((t - h) / h) * 100;
      if (Math.abs(change) >= 8) {
        s.push({
          id: "trajectory",
          title: `Traffic ${change >= 0 ? "rising" : "falling"} within the period`,
          finding: `Within ${d.range.label.toLowerCase()}, daily sessions ${change >= 0 ? "rose" : "fell"} ${Math.abs(change).toFixed(0)}% from start to end (${fmtN(h)}→${fmtN(t)}/day).`,
          note: "intra-period momentum — is the trend accelerating or reversing",
        });
      }
    }
  }

  // 12) Realtime vs typical
  if (d.realtime && d.realtime.hourly_avg > 0) {
    const r = d.realtime;
    const diff = ((r.active_users - r.hourly_avg) / r.hourly_avg) * 100;
    if (Math.abs(diff) >= 20) {
      s.push({
        id: "realtime",
        title: `${fmtN(r.active_users)} on-site now (${pct(diff)} vs typical)`,
        finding: `${fmtN(r.active_users)} active right now vs a ${fmtN(r.hourly_avg)}/hr average — ${pct(diff)}.`,
        note: "something happening right now worth checking",
      });
    }
  }

  return s;
}

const SCHEMA = z.object({
  cards: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["anomaly", "opportunity", "risk", "benchmark", "win"]),
        priority: z.number(),
        why: z.string().max(320),
        recommendation: z.string().max(320),
        ask: z.string().max(160),
      })
    )
    .max(14),
});

/**
 * Turn computed GA4 signals into a prioritised feed of expert insight cards.
 * Numbers come from the deterministic signals; the model only adds judgement,
 * an expert benchmark, a recommendation and an investigate prompt — grounded in
 * the business context. It must not invent numbers.
 */
export async function generateInsights(args: {
  data: DashboardResponse;
  businessType?: string;
  contextSummary?: string;
}): Promise<InsightCard[]> {
  const signals = computeSignals(args.data, args.businessType);
  if (signals.length === 0) return [];

  const label =
    BUSINESS_TYPE_LABEL[(args.businessType as keyof typeof BUSINESS_TYPE_LABEL) || "other"] ?? "website";
  const byId = new Map(signals.map((s) => [s.id, s]));

  const signalText = signals
    .map((s) => `[${s.id}] ${s.finding} (context: ${s.note})`)
    .join("\n");

  const prompt = `You are a senior web-analytics consultant briefing the owner of a ${label}.

BUSINESS CONTEXT:
${args.contextSummary?.slice(0, 1800) || "(limited context)"}

COMPUTED SIGNALS from their GA4 data (the numbers are exact — NEVER change or invent numbers; only reference what's given):
${signalText}

For the most important signals (aim for 10-12, fewer if there aren't enough), produce an insight card. For each:
- kind: anomaly | opportunity | risk | benchmark | win
- priority: 1 = most important
- why: 1-2 sentences on why it matters for a ${label}. Where you know the typical/best-in-class range for this business type, state it as an expert benchmark (e.g. "good SaaS stickiness is 20%+; yours is well below").
- recommendation: one concrete, specific next action.
- ask: a short question the owner could click to investigate further.
Reference each by its exact [id]. Prioritise anomalies, risks and opportunities over wins. Be specific and use the business context where relevant.`;

  try {
    const { object } = await generateObject({
      model: trackedModel("claude-sonnet-4-6", "insights"),
      schema: SCHEMA,
      prompt,
    });
    const cards: InsightCard[] = [];
    for (const c of object.cards) {
      const sig = byId.get(c.id);
      if (!sig) continue;
      cards.push({
        id: c.id,
        kind: c.kind,
        title: sig.title,
        finding: sig.finding,
        why: c.why,
        recommendation: c.recommendation,
        ask: c.ask,
        priority: c.priority,
      });
    }
    cards.sort((a, b) => a.priority - b.priority);
    return cards;
  } catch {
    // Fallback: return the raw signals as minimal cards so the section still renders.
    return signals.slice(0, 10).map((s, i) => ({
      id: s.id,
      kind: "anomaly" as const,
      title: s.title,
      finding: s.finding,
      why: s.note,
      recommendation: "",
      ask: `Tell me more about: ${s.title}`,
      priority: i,
    }));
  }
}

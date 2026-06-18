import { NextRequest, NextResponse } from "next/server";
import { trackedModel } from "@/lib/usage/anthropic";
import { generateText } from "ai";
import { getSession, readUserIds } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { data?: unknown };
  if (!body.data) {
    return NextResponse.json({ narrative: "" });
  }

  try {
    // Pull just the headline numbers to keep the prompt tight.
    const d = body.data as {
      range: { label: string };
      kpi: {
        sessions: { current: number; delta_pct: number | null };
        users: { current: number; delta_pct: number | null };
        engagement_rate: { current: number; delta_pct: number | null };
        conversions: { current: number; delta_pct: number | null };
      };
      top_channels?: Array<{ channel: string; sessions: number; share_pct: number }>;
      device_mix?: { rows: Array<{ device: string; share_pct: number }> };
    };
    const topChannel = d.top_channels?.[0];
    const mobile = d.device_mix?.rows?.find((r) => r.device === "mobile");
    const prompt = `Write a 1-2 sentence TL;DR for an analytics dashboard. Factual, no emojis, no fluff, no greeting. Indian numbering where useful. Mention 1-2 of the most material numbers below. Range: ${d.range.label}.

Sessions: ${d.kpi.sessions.current.toLocaleString("en-IN")} (${
      d.kpi.sessions.delta_pct == null
        ? "no prior"
        : `${d.kpi.sessions.delta_pct >= 0 ? "+" : ""}${d.kpi.sessions.delta_pct.toFixed(1)}% vs prior`
    }).
Users: ${d.kpi.users.current.toLocaleString("en-IN")} (${
      d.kpi.users.delta_pct == null
        ? "no prior"
        : `${d.kpi.users.delta_pct >= 0 ? "+" : ""}${d.kpi.users.delta_pct.toFixed(1)}%`
    }).
Engagement rate: ${d.kpi.engagement_rate.current.toFixed(1)}% (${
      d.kpi.engagement_rate.delta_pct == null
        ? "no prior"
        : `${d.kpi.engagement_rate.delta_pct >= 0 ? "+" : ""}${d.kpi.engagement_rate.delta_pct.toFixed(1)}%`
    }).
Conversions: ${d.kpi.conversions.current.toLocaleString("en-IN")} (${
      d.kpi.conversions.delta_pct == null
        ? "no prior"
        : `${d.kpi.conversions.delta_pct >= 0 ? "+" : ""}${d.kpi.conversions.delta_pct.toFixed(1)}%`
    }).
${topChannel ? `Top channel: ${topChannel.channel} at ${topChannel.share_pct.toFixed(0)}% share.` : ""}
${mobile ? `Mobile share: ${mobile.share_pct.toFixed(0)}%.` : ""}

Output the TL;DR only, no prefix.`;

    const { text } = await generateText({
      model: trackedModel("claude-haiku-4-5-20251001", "dashboard"),
      prompt,
    });
    return NextResponse.json({ narrative: text.trim() });
  } catch {
    return NextResponse.json({ narrative: "" });
  }
}

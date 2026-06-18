import { NextRequest } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, stepCountIs, UIMessage } from "ai";
import { runWithUsage } from "@/lib/usage/context";
import { recordStreamUsage } from "@/lib/usage/anthropic";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import { makeGa4Tools } from "@/lib/tools";
import { makeGoogleAdsTools } from "@/lib/sources/google_ads/tools";
import { makeMoEngageTools } from "@/lib/sources/moengage/tools";
import { workspaceAdsCustomers, workspaceMoEngage } from "@/lib/workspace";
import { SiteProfile } from "@/lib/profile";
import { buildAgentSystem } from "@/lib/agents";
import { VISUALIZATION_GUIDANCE } from "@/lib/viz";
import { getWorkspaceContextSummary } from "@/lib/context/summary";
import {
  createConversation,
  getConversationById,
  upsertConversationMessage,
} from "@/lib/db";
import { isValidAgentId } from "@/lib/property-signature";
import {
  resolveActiveWorkspace,
  resolveWorkspaceWithTokens,
} from "@/lib/workspace";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return new Response("no_active_workspace", { status: 400 });
  }
  const userIds = readUserIds(session);
  const primaryUserId = readPrimaryUserId(session);

  const { messages, agent_id, conversation_id } = (await req.json()) as {
    messages: UIMessage[];
    agent_id?: string | null;
    conversation_id?: number | null;
  };

  // Resolve or create conversation
  let conv = conversation_id ? getConversationById(conversation_id) : null;
  if (conv && !userIds.includes(conv.user_id)) {
    return new Response("not_authorized", { status: 403 });
  }
  if (!conv && primaryUserId) {
    const primaryAgent = agent_id && isValidAgentId(agent_id) && agent_id !== "all"
      ? agent_id
      : null;
    conv = createConversation({
      user_id: primaryUserId,
      workspace_id: ws.id,
      primary_agent_id: primaryAgent,
    });
  }
  if (!conv) return new Response("no_conversation", { status: 500 });

  // Persist incoming user messages
  for (const m of messages) {
    if (m.role !== "user") continue;
    upsertConversationMessage({
      conversation_id: conv.id,
      message_id: m.id,
      role: "user",
      content: JSON.stringify(m),
    });
  }

  const wsWithTokens = await resolveWorkspaceWithTokens(ws);
  const ga4Tools = makeGa4Tools(wsWithTokens.properties, ws.id);
  const effectiveUserId = primaryUserId ?? wsWithTokens.workspace.user_id;
  const adsTools = makeGoogleAdsTools({
    userId: effectiveUserId,
    adsCustomers: workspaceAdsCustomers(ws).map((s) => ({
      customer_id: s.source_id,
      display_name: s.display_name,
      account_email: s.account_email,
    })),
    ga4Active: wsWithTokens.properties,
  });
  const moeTools = makeMoEngageTools({
    userId: effectiveUserId,
    attached: workspaceMoEngage(ws).length > 0,
    ga4Active: wsWithTokens.properties,
  });
  const tools = { ...ga4Tools, ...adsTools, ...moeTools };
  const ctxSummary = await getWorkspaceContextSummary(ws.id);

  const contextBlock = ctxSummary.hasContext
    ? `\n\nWHAT WE ALREADY KNOW ABOUT THIS BRAND (from customer intelligence — already loaded; do NOT call query_context just to re-fetch this):\n${ctxSummary.summary}\n\nWhen the user's question intersects with anything above, weave it in naturally and cite the source. Call query_context when you need MORE specific business context not covered here.`
    : `\n\nCUSTOMER INTELLIGENCE: not built yet for this workspace. You can suggest the user build it on /workspaces/context for richer answers, but don't push.`;

  const system =
    buildSystemPrompt(wsWithTokens, ws.kind === "union") +
    `\n\nVISUALIZATION:\n${VISUALIZATION_GUIDANCE}` +
    `\n\nCUSTOMER INTELLIGENCE (RAG):\nYou have access to query_context — a search over the workspace's customer intelligence (crawled website, news, brand SERP, reviews from Trustpilot/Google Maps/Indeed, LinkedIn, X/Twitter, Google AI Overview, search trends, and any user-uploaded docs). Use it when a GA4 number needs business context to interpret (a traffic drop might correlate with a news event, a conversion spike might align with a campaign launch in a LinkedIn post, etc.). Cite findings by source ("Trustpilot reviewer on May 8 said..."). Don't manufacture context — if results are empty, say so plainly.` +
    contextBlock +
    buildAgentSystem(agent_id);

  const modelMessages = await convertToModelMessages(messages);
  // Attribute this conversation's token usage to the account + "chat" section.
  return runWithUsage(
    { userId: effectiveUserId ?? null, workspaceId: ws.id, section: "chat" },
    () => {
      const result = streamText({
        model: anthropic("claude-sonnet-4-6"),
        system,
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(8),
        onFinish: ({ usage }) => {
          recordStreamUsage("claude-sonnet-4-6", usage, "chat");
        },
      });

      return result.toUIMessageStreamResponse({
        headers: { "X-Conversation-Id": String(conv.id) },
      });
    }
  );
}

function buildSystemPrompt(
  wsWithTokens: {
    workspace: { name: string; kind: string };
    properties: Array<{
      property: { display_name: string; website_url: string | null; site_profile_json: string | null };
    }>;
  },
  isUnion: boolean
): string {
  const propertySummaries = wsWithTokens.properties
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

  const workspaceLine = `Workspace: "${wsWithTokens.workspace.name}" (${wsWithTokens.workspace.kind})`;

  const unionAddendum = isUnion
    ? `\n\nWORKSPACE CONTEXT — UNION\nYou are operating in a union workspace covering ${wsWithTokens.properties.length} properties. When you call run_report, results are AGGREGATED across all properties by default. Call out which property is driving a pattern when the aggregate hides per-property dynamics. Use run_per_property_report for explicit comparisons.`
    : "";

  return `You are a GA4 analytics assistant.

${workspaceLine}

EMOJI POLICY: do not use emojis. Plain markdown only (headers, bold, tables, lists). The only exception: GA4 event names or page paths that themselves contain emojis — render those as inline \`code\`.

ACTIVE PROPERTIES:
${propertySummaries}${unionAddendum}

TOOL CALLING RULES:
- For any question about traffic, users, conversions, events, demographics, devices, geography, or behavior: call a GA4 tool BEFORE answering. Never answer from prior context alone.
- For ambiguous "how are we doing"-style questions, call get_property_overview first.
- For demographic/geographic/device questions, prefer get_demographics_breakdown.
- For product behavior, call get_product_usage.
- Bias toward calling run_report with multiple metrics at once.

DATA INTEGRITY — CONVERSIONS (read carefully):
- GA4's "conversions"/"keyEvents" metric counts key-EVENT OCCURRENCES, not the number of sessions that converted. One session can fire a key event many times — or zero.
- NEVER compute or present (conversions ÷ sessions) as a "conversion rate". That ratio is "key events per session" and is frequently ~100%. Label the raw count "key events", not "conversions", when that's what it is.
- For a real conversion RATE, request the GA4 metric \`sessionConversionRate\` (a.k.a. \`sessionKeyEventRate\`) via run_report and quote THAT.
- RED FLAG: if a "rate" sits at ~95–100% across most or all sources, it is almost never a real purchase rate — it means a high-frequency event (page_view, session_start, user_engagement) is marked as a key event. Say so plainly ("this looks like a key-event tracking-config issue, not a 99% conversion rate") instead of reporting it as fact, and suggest checking which events are marked as key events in GA4 Admin.

FORMATTING:
- Indian numbering (1,75,000 not 175,000).
- Percentages with 1 decimal.
- Bold the headline number.
- End with a single "So what:" line giving the next move.`;
}

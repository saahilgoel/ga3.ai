import { NextRequest, NextResponse } from "next/server";
import { trackedModel } from "@/lib/usage/anthropic";
import { generateText } from "ai";
import { getSession, readUserIds } from "@/lib/session";
import { AGENT_MAP } from "@/lib/agents";
import { getConversationById, updateConversation } from "@/lib/db";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  const conv = getConversationById(id);
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!userIds.includes(conv.user_id)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const body = (await req.json()) as { first_message?: string };
  const firstMsg = body.first_message?.trim();
  if (!firstMsg) {
    return NextResponse.json({ error: "missing_first_message" }, { status: 400 });
  }

  const agent =
    conv.primary_agent_id && AGENT_MAP[conv.primary_agent_id]
      ? AGENT_MAP[conv.primary_agent_id].name
      : "the moderator";

  try {
    const { text } = await generateText({
      model: trackedModel("claude-haiku-4-5-20251001", "title"),
      prompt: `Generate a 3-6 word title for a chat about analytics. The title should be SPECIFIC (mention the metric/dimension/topic), not generic. Do not use quotes. No trailing punctuation.

Examples:
- "what were our top channels last week" → Top channels last week
- "why did mobile bounce rate spike" → Mobile bounce rate spike
- "show me the funnel for Ship Now" → Ship Now funnel analysis

User's first message: "${firstMsg.slice(0, 500)}"
Agent: ${agent}

Return ONLY the title.`,
    });
    const title = text
      .trim()
      .replace(/^["'`]+|["'`.!?]+$/g, "")
      .slice(0, 80);
    if (title) {
      updateConversation({ id, user_ids: userIds, title });
    }
    return NextResponse.json({ ok: true, title });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

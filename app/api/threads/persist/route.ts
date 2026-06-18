// Legacy v3-v4 endpoint — now routes through conversations.
import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import { getConversationById, upsertConversationMessage } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as {
    conversation_id?: number;
    agent_id?: string | null;
    message: {
      id: string;
      role: "user" | "assistant";
      parts?: unknown[];
    };
  };

  if (!body.conversation_id || !body.message?.id || !body.message?.role) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const conv = getConversationById(body.conversation_id);
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!userIds.includes(conv.user_id)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }
  upsertConversationMessage({
    conversation_id: conv.id,
    message_id: body.message.id,
    role: body.message.role,
    content: JSON.stringify(body.message),
    author_agent_id: body.agent_id ?? null,
  });
  return NextResponse.json({ ok: true });
}

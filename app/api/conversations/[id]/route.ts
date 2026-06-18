import { NextRequest, NextResponse } from "next/server";
import { getSession, readUserIds } from "@/lib/session";
import {
  deleteConversation,
  getConversationById,
  getConversationParticipants,
  listConversationMessages,
  updateConversation,
} from "@/lib/db";

export async function GET(
  _req: NextRequest,
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
  const messages = listConversationMessages(id);
  return NextResponse.json({
    conversation: {
      id: conv.id,
      title: conv.title,
      primary_agent_id: conv.primary_agent_id,
      pinned: conv.pinned === 1,
      archived: conv.archived === 1,
      created_at: conv.created_at,
      last_message_at: conv.last_message_at,
      participants: getConversationParticipants(id),
    },
    messages: messages.map((m) => ({
      id: m.id,
      message_id: m.message_id,
      role: m.role,
      content: m.content,
      author_agent_id: m.author_agent_id,
    })),
  });
}

export async function PATCH(
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
  const body = (await req.json()) as {
    title?: string;
    primary_agent_id?: string | null;
    pinned?: boolean;
    archived?: boolean;
  };
  const updated = updateConversation({
    id,
    user_ids: userIds,
    title: body.title,
    primary_agent_id: body.primary_agent_id,
    pinned: body.pinned,
    archived: body.archived,
  });
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ conversation: updated });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const { id: idStr } = await context.params;
  const id = parseInt(idStr, 10);
  deleteConversation({ id, user_ids: userIds });
  return NextResponse.json({ ok: true });
}

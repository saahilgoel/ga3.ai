import { NextRequest, NextResponse } from "next/server";
import {
  getSession,
  readPrimaryUserId,
  readUserIds,
} from "@/lib/session";
import {
  createConversation,
  getConversationParticipantsBatch,
  listConversations,
} from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { publish } from "@/lib/pubsub";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) return NextResponse.json({ conversations: [] });

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const includeArchived = url.searchParams.get("archived") === "1";

  const rows = listConversations({
    user_ids: userIds,
    workspace_id: ws.id,
    limit,
    include_archived: includeArchived,
  });

  const partsMap = getConversationParticipantsBatch(rows.map((c) => c.id));
  return NextResponse.json(
    {
      conversations: rows.map((c) => ({
        id: c.id,
        title: c.title,
        primary_agent_id: c.primary_agent_id,
        pinned: c.pinned === 1,
        archived: c.archived === 1,
        created_at: c.created_at,
        last_message_at: c.last_message_at,
        participants: partsMap.get(c.id) ?? [],
      })),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=60",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const userIds = readUserIds(session);
  const userId = readPrimaryUserId(session);
  if (!userId || userIds.length === 0) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const ws = resolveActiveWorkspace(session);
  if (!ws) {
    return NextResponse.json({ error: "no_active_workspace" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    primary_agent_id?: string | null;
    title?: string | null;
  };
  const conv = createConversation({
    user_id: userId,
    workspace_id: ws.id,
    primary_agent_id: body.primary_agent_id ?? null,
    title: body.title ?? null,
  });
  try {
    publish(userId, {
      kind: "conversation.changed",
      conversation_id: conv.id,
      workspace_id: ws.id,
    });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ conversation: conv });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession, readPrimaryUserId, readUserIds } from "@/lib/session";
import {
  createConversation,
  getFindingById,
  updateFindingStatus,
  upsertConversationMessage,
} from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";

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
  if (!id) return NextResponse.json({ error: "invalid_id" }, { status: 400 });

  const finding = getFindingById(id, userIds);
  if (!finding) return NextResponse.json({ error: "not_found" }, { status: 404 });

  updateFindingStatus({ id, user_ids: userIds, status: "investigating" });

  const primaryUserId = readPrimaryUserId(session);
  const ws = resolveActiveWorkspace(session);
  if (!primaryUserId || !ws) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  // Create a brand-new conversation seeded with the finding's content.
  // The finding itself is attached via seed_finding_id so the chat view can
  // render the full original card at the top — not just the seed text.
  const conv = createConversation({
    user_id: primaryUserId,
    workspace_id: ws.id,
    primary_agent_id: finding.agent_id,
    title: finding.title,
    seed_finding_id: finding.id,
  });

  // The seed message the user "asked" — keep it short. The full finding card
  // is rendered separately by the chat page.
  const seed = finding.question
    ? finding.question
    : "What should I do about this?";

  return NextResponse.json({
    ok: true,
    redirect_url: `/chat/${conv.id}?ask=${encodeURIComponent(seed)}`,
  });
}

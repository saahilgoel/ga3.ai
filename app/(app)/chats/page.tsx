import { redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import {
  getConversationParticipants,
  listConversations,
} from "@/lib/db";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { ChatsClient } from "./chats-client";

export default async function ChatsPage() {
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");

  const all = listConversations({
    user_ids: userIds,
    workspace_id: ws.id,
    limit: 500,
    include_archived: true,
  });

  const enriched = all.map((c) => ({
    id: c.id,
    title: c.title ?? "Untitled chat",
    primary_agent_id: c.primary_agent_id,
    pinned: c.pinned === 1,
    archived: c.archived === 1,
    last_message_at: c.last_message_at,
    created_at: c.created_at,
    participants: getConversationParticipants(c.id),
  }));

  return (
    <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-full lg:max-w-[820px] py-6 lg:py-8">
            <ChatsClient conversations={enriched} />
          </div>
        </div>
        );
}

import { redirect } from "next/navigation";
import { getSession, readUserIds, readPrimaryUserId } from "@/lib/session";
import { resolveActiveWorkspace } from "@/lib/workspace";
import { createConversation, getPropertiesByIds } from "@/lib/db";
import { isValidAgentId } from "@/lib/property-signature";
import { ChatClient } from "../chat-client";
import type { SiteProfile } from "@/components/site-profile-card";
import { parseWorkspacePropertyIds, workspaceProperties } from "@/lib/workspace";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams?: Promise<{ agent?: string; ask?: string }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");
  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");
  const primaryUserId = readPrimaryUserId(session)!;

  const agent_id =
    sp?.agent && isValidAgentId(sp.agent) && sp.agent !== "all" ? sp.agent : null;

  // Create the conversation up front so the URL is stable.
  const conv = createConversation({
    user_id: primaryUserId,
    workspace_id: ws.id,
    primary_agent_id: agent_id,
  });

  if (sp?.ask) {
    redirect(`/chat/${conv.id}?ask=${encodeURIComponent(sp.ask)}`);
  }
  redirect(`/chat/${conv.id}${agent_id ? `?agent=${agent_id}` : ""}`);

  // unreachable
  void getPropertiesByIds;
  void parseWorkspacePropertyIds;
  void workspaceProperties;
  void ChatClient;
  const _: SiteProfile | undefined = undefined;
  void _;
  return null;
}

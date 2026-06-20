import { notFound, redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import {
  getConversationById,
  getFindingById,
  listConversationMessages,
} from "@/lib/db";
import { resolveActiveWorkspace, workspaceProperties } from "@/lib/workspace";
import { hydrateConversation } from "@/lib/conversation-hydrate";
import { ChatClient } from "../chat-client";
import type { SiteProfile } from "@/components/site-profile-card";
import type { SeedFinding } from "@/components/finding-context-card";
import type { Visualization } from "@/lib/viz";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ask?: string; agent?: string }>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = parseInt(idStr, 10);
  if (!id) notFound();

  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");

  const conv = getConversationById(id);
  if (!conv) notFound();
  if (!userIds.includes(conv.user_id)) notFound();

  const ws = resolveActiveWorkspace(session);
  if (!ws) redirect("/properties");

  const props = workspaceProperties(ws);
  if (props.length === 0) redirect("/properties");

  const rows = listConversationMessages(conv.id);
  const { messages: initialMessages, msgAgent: initialMsgAgent } =
    hydrateConversation(rows, conv);

  const properties = props.map((p) => {
    let profile: SiteProfile | null = null;
    if (p.site_profile_json) {
      try {
        profile = JSON.parse(p.site_profile_json) as SiteProfile;
      } catch {
        profile = null;
      }
    }
    return {
      id: p.id,
      display_name: p.display_name,
      website_url: p.website_url,
      ga4_property_id: p.ga4_property_id,
      profile,
    };
  });

  // Hydrate the seed finding (for the Investigate flow)
  let seedFinding: SeedFinding | null = null;
  if (conv.seed_finding_id) {
    const f = getFindingById(conv.seed_finding_id, userIds);
    if (f) {
      let viz: Visualization | null = null;
      if (f.visualization_json) {
        try {
          viz = JSON.parse(f.visualization_json) as Visualization;
        } catch {
          viz = null;
        }
      }
      seedFinding = {
        id: f.id,
        agent_id: f.agent_id,
        title: f.title,
        body: f.body,
        severity: f.severity as "high" | "medium" | "low",
        question: f.question,
        visualization: viz,
        created_at: f.created_at,
      };
    }
  }

  return (
    <ChatClient
      activeProperties={properties}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialMessages={initialMessages as any}
      initialMsgAgent={initialMsgAgent}
      seedInput={sp?.ask}
      conversationId={conv.id}
      conversationTitle={conv.title}
      primaryAgentId={conv.primary_agent_id ?? sp?.agent ?? null}
      pinned={conv.pinned === 1}
      archived={conv.archived === 1}
      seedFinding={seedFinding}
    />
  );
}

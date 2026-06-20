import { notFound, redirect } from "next/navigation";
import { getSession, readUserIds } from "@/lib/session";
import { getConversationById, listConversationMessages } from "@/lib/db";
import { hydrateConversation } from "@/lib/conversation-hydrate";
import { SharedTranscript } from "@/components/shared-chat";
import { PrintToolbar } from "./print-trigger";

export const dynamic = "force-dynamic";

// Owner-only, chrome-free PDF/print view of a conversation. Reachable for any of
// the user's own chats regardless of share status; "Download PDF" in the chat
// menu opens this in a new tab and it auto-triggers the print dialog.
export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!id) notFound();

  const session = await getSession();
  const userIds = readUserIds(session);
  if (userIds.length === 0) redirect("/");

  const conv = getConversationById(id);
  if (!conv) notFound();
  if (!userIds.includes(conv.user_id)) notFound();

  const rows = listConversationMessages(conv.id);
  const { messages, msgAgent } = hydrateConversation(rows, conv);

  return (
    <div className="print-theme">
      <PrintToolbar chatId={conv.id} />
      <SharedTranscript
        title={conv.title}
        primaryAgentId={conv.primary_agent_id}
        createdAt={conv.created_at}
        messages={messages}
        msgAgent={msgAgent}
      />
    </div>
  );
}

import type { ConversationMessageRow, ConversationRow } from "@/lib/db";

type AnyMsg = { id?: string; role?: string };

/**
 * Reconstruct the in-memory chat state from stored conversation rows.
 *
 * Each row's `content` is a serialised Vercel AI SDK `UIMessage`. We also build
 * the message-id → agent-id map the UI needs to colour/attribute each assistant
 * turn (an assistant row carries `author_agent_id`; turns without one fall back
 * to the conversation's primary agent).
 *
 * Shared by the owner chat view, the public share page, and the PDF/print page
 * so every surface renders an identical transcript.
 */
export function hydrateConversation(
  rows: ConversationMessageRow[],
  conv: Pick<ConversationRow, "primary_agent_id">
): { messages: AnyMsg[]; msgAgent: Array<[string, string]> } {
  const messages = rows
    .map((r) => {
      try {
        return JSON.parse(r.content) as AnyMsg;
      } catch {
        return null;
      }
    })
    .filter((m): m is AnyMsg => m !== null && typeof m.id === "string");

  const msgAgent: Array<[string, string]> = [];
  for (const m of rows) {
    if (m.role === "assistant" && m.author_agent_id) {
      try {
        const parsed = JSON.parse(m.content) as AnyMsg;
        if (parsed?.id) msgAgent.push([parsed.id, m.author_agent_id]);
      } catch {
        // skip unparseable rows
      }
    }
  }
  if (conv.primary_agent_id) {
    for (const m of messages) {
      if (
        m.role === "assistant" &&
        m.id &&
        !msgAgent.find(([id]) => id === m.id)
      ) {
        msgAgent.push([m.id, conv.primary_agent_id]);
      }
    }
  }

  return { messages, msgAgent };
}

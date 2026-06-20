import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getConversationByShareToken,
  listConversationMessages,
} from "@/lib/db";
import { hydrateConversation } from "@/lib/conversation-hydrate";
import { SharedTranscript } from "@/components/shared-chat";
import { PrintButton } from "./share-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const conv = getConversationByShareToken(token);
  const title = conv?.title ?? "Shared conversation";
  return {
    title: `${title} · GA3`,
    description: "A shared analytics conversation from GA3 — ga3.ai",
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const conv = getConversationByShareToken(token);
  if (!conv || !conv.share_token) notFound();

  const rows = listConversationMessages(conv.id);
  const { messages, msgAgent } = hydrateConversation(rows, conv);

  return (
    <div className="print-theme">
      <div className="no-print sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--bg)]/95 backdrop-blur">
        <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <a href="https://ga3.ai" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/mark.svg" alt="GA3" width={20} height={20} className="block" />
            <span className="font-mono text-[13px] font-semibold tracking-tight">GA3</span>
          </a>
          <div className="flex items-center gap-2">
            <PrintButton />
            <a
              href="https://ga3.ai"
              className="inline-flex items-center h-8 px-3 rounded-md bg-[color:var(--neon)] text-white text-[12px] font-mono font-medium hover:opacity-90 tx-hover"
            >
              Try GA3 free
            </a>
          </div>
        </div>
      </div>

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

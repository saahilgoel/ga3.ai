import type { UIMessage } from "ai";
import { ChatMessage } from "@/components/chat-message";
import { AGENT_MAP } from "@/lib/agents";

// A self-contained, read-only render of a conversation transcript. Used by the
// public share page (/share/[token]) and the PDF/print page (/print/[id]). It
// reads the active theme purely through CSS variables, so the same component
// looks right on the dark app theme and the light `.print-theme` wrapper.
export function SharedTranscript({
  title,
  primaryAgentId,
  createdAt,
  messages,
  msgAgent,
}: {
  title: string | null;
  primaryAgentId: string | null;
  createdAt: number; // unix seconds
  // Parsed UIMessage objects (loose at the boundary; cast at render).
  messages: Array<{ id?: string; role?: string }>;
  msgAgent: Array<[string, string]>;
}) {
  const agentFor = new Map(msgAgent);
  const primaryAgent = primaryAgentId ? AGENT_MAP[primaryAgentId] : null;
  const dateLabel = new Date(createdAt * 1000).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 py-8">
      <header className="mb-8 pb-6 border-b border-[color:var(--border)]">
        <div className="flex items-center gap-2 mb-5 text-[color:var(--text-tertiary)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark.svg" alt="" width={18} height={18} className="block" />
          <span className="font-mono text-[12px] tracking-[0.04em]">
            GA3 <span className="text-[color:var(--text-muted)]">· shared conversation</span>
          </span>
        </div>
        <h1 className="font-mono text-[24px] font-semibold tracking-tight leading-tight text-[color:var(--text-primary)]">
          {title ?? "Untitled conversation"}
        </h1>
        <div className="mt-2 flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)] font-mono">
          {primaryAgent && (
            <>
              <span className="text-[color:var(--text-secondary)]">{primaryAgent.name}</span>
              <span className="text-[color:var(--text-muted)]">· {primaryAgent.title}</span>
              <span className="text-[color:var(--text-muted)]">·</span>
            </>
          )}
          <span>{dateLabel}</span>
        </div>
      </header>

      <div className="space-y-6">
        {messages.map((m) => {
          const id = m.id ?? Math.random().toString(36);
          const agentId =
            m.role === "assistant"
              ? agentFor.get(m.id ?? "") ?? primaryAgentId ?? null
              : null;
          return (
            <ChatMessage
              key={id}
              message={m as UIMessage}
              agentId={agentId}
              readOnly
            />
          );
        })}
      </div>

      <footer className="mt-12 pt-6 border-t border-[color:var(--border)] flex items-center justify-between gap-3 text-[12px] font-mono text-[color:var(--text-tertiary)]">
        <span>Generated with GA3</span>
        <a
          href="https://ga3.ai"
          className="text-[color:var(--neon-bright)] hover:underline no-print"
        >
          Turn your GA4 into a conversation → ga3.ai
        </a>
      </footer>
    </div>
  );
}

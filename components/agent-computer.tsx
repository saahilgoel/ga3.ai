"use client";

import { X } from "lucide-react";
import { AGENT_MAP } from "@/lib/agents";
import { Monogram } from "@/components/monogram";

export type ToolCallItem = {
  id: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  state?: string;
  agentId?: string | null;
};

// Right-side "agent's computer" — a live timeline of the agent's tool calls in
// this conversation + the selected step's input/output. Desktop only; on mobile
// tool calls expand inline instead.
export function AgentComputer({
  calls,
  selectedId,
  onSelect,
  onClose,
  agentId,
}: {
  calls: ToolCallItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  agentId?: string | null;
}) {
  const sel = calls.find((c) => c.id === selectedId) ?? calls[calls.length - 1] ?? null;
  const agent = agentId && AGENT_MAP[agentId] ? AGENT_MAP[agentId] : null;
  const running = (s?: string) => s === "input-streaming" || s === "input-available";

  return (
    <aside className="hidden md:flex w-[400px] lg:w-[440px] shrink-0 flex-col border-l border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-[color:var(--border)] shrink-0">
        {agent ? (
          <Monogram agent={agent} size={26} />
        ) : (
          <span className="font-mono text-[color:var(--neon)]">⌁</span>
        )}
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-semibold truncate">
            {agent ? `${agent.name}'s computer` : "Agent computer"}
          </div>
          <div className="font-mono text-[10px] text-[color:var(--text-tertiary)] tabular-nums">
            {calls.length} step{calls.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto size-7 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
        >
          <X strokeWidth={1.5} className="size-4" />
        </button>
      </div>

      {/* timeline */}
      <div className="shrink-0 max-h-[40%] overflow-y-auto border-b border-[color:var(--border)] py-1">
        {calls.map((c, i) => {
          const isSel = c.id === sel?.id;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full flex items-center gap-2 px-4 py-1.5 text-left tx-hover font-mono text-[12px] ${
                isSel
                  ? "bg-[color:var(--surface-hover)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              <span className="text-[color:var(--text-muted)] tabular-nums w-5 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                  background: running(c.state) ? "var(--neon)" : "var(--border-strong)",
                  boxShadow: running(c.state) ? "0 0 6px var(--neon)" : undefined,
                }}
              />
              <span className="truncate">{c.toolName}</span>
            </button>
          );
        })}
      </div>

      {/* detail */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-[color:var(--text-tertiary)] space-y-3">
        {sel ? (
          <>
            <div className="text-[12px] text-[color:var(--text-primary)]">
              {running(sel.state) ? "Running" : "Called"} <span className="text-[color:var(--neon)]">{sel.toolName}</span>
            </div>
            {sel.input != null && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.06em] opacity-50 mb-1">input</div>
                <pre className="whitespace-pre-wrap break-words leading-relaxed rounded bg-[color:var(--bg)] p-2 border border-[color:var(--border)]">
                  {JSON.stringify(sel.input, null, 2)}
                </pre>
              </div>
            )}
            {sel.output != null && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.06em] opacity-50 mb-1">output</div>
                <pre className="whitespace-pre-wrap break-words leading-relaxed rounded bg-[color:var(--bg)] p-2 border border-[color:var(--border)]">
                  {JSON.stringify(sel.output, null, 2)}
                </pre>
              </div>
            )}
            {sel.errorText && (
              <div className="text-[color:var(--severity-high)]">error: {sel.errorText}</div>
            )}
          </>
        ) : (
          <div className="text-[color:var(--text-tertiary)]">No step selected.</div>
        )}
      </div>
    </aside>
  );
}

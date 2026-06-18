"use client";

import { Monogram } from "@/components/monogram";
import type { Agent } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";

export function AgentThreadHeader({
  agent,
  onPickChip,
}: {
  agent: Agent;
  onPickChip: (q: string) => void;
}) {
  const accent = AGENT_HEX[agent.color];
  return (
    <div className="px-4 lg:px-0 pt-6 pb-5 border-b border-[color:var(--border)]">
      <div className="flex items-start gap-3">
        <div className="shrink-0 pt-1">
          <Monogram agent={agent} size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              aria-hidden
              className="block h-4 w-[2px] rounded-full self-center"
              style={{ background: accent }}
            />
            <span className="font-mono text-[22px] font-medium text-[color:var(--text-primary)] leading-tight">
              {agent.name}
            </span>
            <span className="text-[14px] text-[color:var(--text-tertiary)]">
              · {agent.title}
            </span>
          </div>
          <div className="font-mono text-[15px] text-[color:var(--text-tertiary)] mt-1.5">
            {agent.tagline}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {agent.signatureMoves.map((q) => (
          <button
            key={q}
            onClick={() => onPickChip(q)}
            className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)] text-[color:var(--text-secondary)] tx-hover text-[12px]"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { MessageCircleQuestion } from "lucide-react";
import { Monogram } from "@/components/monogram";
import { AGENT_MAP } from "@/lib/agents";
import { AGENT_HEX, type Visualization } from "@/lib/viz";
import { MarkdownMessage } from "@/components/markdown-message";
import { VisualizationRenderer } from "@/components/viz";

export type SeedFinding = {
  id: number;
  agent_id: string;
  title: string;
  body: string;
  severity: "high" | "medium" | "low";
  question: string | null;
  visualization: Visualization | null;
  created_at: number;
};

export function FindingContextCard({ finding }: { finding: SeedFinding }) {
  const agent = AGENT_MAP[finding.agent_id];
  const accent = agent ? AGENT_HEX[agent.color] : AGENT_HEX.default;
  const sevLabel = finding.severity === "medium" ? "MED" : finding.severity.toUpperCase();
  const sevColor =
    finding.severity === "high"
      ? "var(--severity-high)"
      : finding.severity === "medium"
      ? "var(--severity-medium)"
      : "var(--severity-low)";

  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
      <div className="px-4 py-2 border-b border-[color:var(--border)] flex items-center gap-2 text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
        <span className="uppercase tracking-[0.08em]">From the Newsroom</span>
        <span>·</span>
        <span>{timeAgo(finding.created_at)}</span>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-[12px]">
          {agent && <Monogram agent={agent} size={20} />}
          {agent && (
            <span className="font-serif text-[14px] font-medium text-[color:var(--text-primary)]">
              {agent.name}
            </span>
          )}
          <span className="text-[color:var(--text-tertiary)]">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: sevColor }}
            />
            <span
              className="font-mono text-[11px] tracking-[0.06em] font-medium"
              style={{ color: sevColor }}
            >
              {sevLabel}
            </span>
          </span>
        </div>

        <h3 className="font-serif text-[17px] font-medium leading-[1.3] text-[color:var(--text-primary)]">
          {finding.title}
        </h3>

        <div className="text-[13px] leading-[1.65] text-[color:var(--text-secondary)]">
          <MarkdownMessage content={finding.body} />
        </div>

        {finding.visualization && (
          <div className="max-w-[420px]">
            <VisualizationRenderer
              viz={finding.visualization}
              agentId={finding.agent_id}
              compact
            />
          </div>
        )}

        {finding.question && (
          <div className="flex items-start gap-2 text-[13px] pt-1">
            <MessageCircleQuestion
              strokeWidth={1.5}
              className="size-4 mt-0.5 shrink-0"
              style={{ color: accent }}
            />
            <span className="italic text-[color:var(--text-secondary)]">{finding.question}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

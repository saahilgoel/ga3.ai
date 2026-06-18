"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AGENTS, AGENT_MAP, AGENT_PHRASES } from "@/lib/agents";
import { AGENT_HEX } from "@/lib/viz";
import { getBriefingLabel } from "@/lib/polish";
import { MarkdownMessage } from "@/components/markdown-message";
import { Monogram } from "@/components/monogram";

export type Insight = {
  agent: string;
  title: string;
  body: string;
  recommended_action: string;
  impact: "high" | "medium" | "low";
};

const IMPACT_BADGE: Record<string, { dot: string; label: string }> = {
  high: { dot: "bg-rose-500", label: "high impact" },
  medium: { dot: "bg-amber-500", label: "medium" },
  low: { dot: "bg-zinc-500", label: "low" },
};

export function BriefingModal({
  open,
  onClose,
  initialInsights,
  generatedAt,
  onPinned,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  initialInsights: Insight[] | null;
  generatedAt: number | null;
  onPinned?: (sourceRect: DOMRect, insight: Insight) => void;
  onGenerated?: (cached: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<Insight[] | null>(initialInsights);
  const [error, setError] = useState<string | null>(null);
  const [genAt, setGenAt] = useState<number | null>(generatedAt);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  // Portal to <body> so the overlay escapes the TopBar's backdrop-filter
  // stacking context (which otherwise traps this fixed modal behind the feed).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open && insights === null && !loading) generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function generate(force: boolean) {
    setError(null);
    setLoading(true);
    if (force) setInsights(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        insights: Insight[];
        generated_at: number;
        cached: boolean;
      };
      setInsights(data.insights);
      setGenAt(data.generated_at);
      onGenerated?.(data.cached);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function pin(insight: Insight, key: string, sourceRect?: DOMRect) {
    if (pinnedIds.has(key)) return;
    setPinnedIds((prev) => new Set(prev).add(key));
    if (sourceRect) onPinned?.(sourceRect, insight);
    await fetch("/api/pinned", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: insight.title,
        body: `${insight.body}\n\nAction: ${insight.recommended_action}`,
        agent: insight.agent,
        data: insight,
      }),
    }).catch(() => {});
  }

  function copySlack(insight: Insight) {
    const agent = AGENT_MAP[insight.agent];
    const emoji = agent?.emoji ?? "📊";
    const name = agent?.name ?? "Agent";
    const md = `*${emoji} ${insight.title}* — _${name}_\n${insight.body}\n> *Action:* ${insight.recommended_action}\n_Impact: ${insight.impact}_`;
    navigator.clipboard.writeText(md);
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-8 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--border)]">
          <div>
            <div className="text-lg font-semibold">{getBriefingLabel()}</div>
            {genAt && (
              <div className="text-xs text-[color:var(--muted-foreground)] mt-0.5">
                Generated {timeAgo(genAt)} · cached for 6 hours
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => generate(true)}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--muted)] disabled:opacity-50"
            >
              ↻ Refresh
            </button>
            <button
              onClick={onClose}
              className="size-8 rounded-md hover:bg-[color:var(--muted)] flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-5 space-y-3">
          {loading && (insights === null || insights.length === 0) && <AgentsWorking />}

          {error && (
            <div className="text-sm text-red-400 p-3 rounded-md border border-rose-900/40 bg-rose-950/40">
              {error}
            </div>
          )}

          {insights && insights.length > 0 && (
            <div className="space-y-3">
              {insights.map((ins, i) => {
                const key = `${ins.agent}-${ins.title}-${i}`;
                return (
                  <InsightCard
                    key={key}
                    insight={ins}
                    index={i}
                    pinned={pinnedIds.has(key)}
                    onPin={(rect) => pin(ins, key, rect)}
                    onCopy={() => copySlack(ins)}
                  />
                );
              })}
            </div>
          )}

          {insights && insights.length === 0 && !loading && (
            <div className="text-sm text-[color:var(--muted-foreground)] py-12 text-center">
              No insights surfaced this round — try refreshing in a few minutes, or activate a property with more recent traffic.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function AgentsWorking() {
  return (
    <div className="space-y-3 py-2">
      {AGENTS.map((a, i) => (
        <AgentWorkingRow key={a.id} agentIndex={i} />
      ))}
    </div>
  );
}

function AgentWorkingRow({ agentIndex }: { agentIndex: number }) {
  const agent = AGENTS[agentIndex];
  const accent = AGENT_HEX[agent.color] ?? AGENT_HEX.default;
  const [phraseIdx, setPhraseIdx] = useState(0);
  const phrases = AGENT_PHRASES[agent.id] ?? ["working…"];

  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseIdx((p) => (p + 1) % phrases.length);
    }, 2200 + agentIndex * 200);
    return () => clearInterval(interval);
  }, [agentIndex, phrases.length]);

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5"
      style={{ animation: `fadeInUp 360ms ease ${agentIndex * 90}ms both` }}
    >
      <Monogram agent={agent} size={24} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium flex items-center gap-2">
          <span
            aria-hidden
            className="block h-3 w-[2px] rounded-full"
            style={{ background: accent }}
          />
          <span className="text-[color:var(--text-primary)]">{agent.name}</span>
          <span className="text-[color:var(--text-tertiary)] text-[11px] font-mono">
            · {agent.title}
          </span>
        </div>
        <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] italic mt-0.5">
          {phrases[phraseIdx]}
        </div>
      </div>
      <div className="w-20 h-[2px] rounded-full bg-[color:var(--border)] overflow-hidden">
        <div
          className="h-full"
          style={{
            background: accent,
            animation: `shimmer 1.6s ease-in-out infinite`,
          }}
        />
      </div>
    </div>
  );
}

function InsightCard({
  insight,
  index,
  pinned,
  onPin,
  onCopy,
}: {
  insight: Insight;
  index: number;
  pinned: boolean;
  onPin: (sourceRect: DOMRect) => void;
  onCopy: () => void;
}) {
  const agent = AGENT_MAP[insight.agent];
  const accent = agent ? AGENT_HEX[agent.color] ?? AGENT_HEX.default : null;
  const badge = IMPACT_BADGE[insight.impact] ?? IMPACT_BADGE.low;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function handlePin(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    onPin(rect);
  }

  return (
    <div
      className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden"
      style={{
        animation: `fadeInUp 360ms ease ${index * 80}ms both`,
        borderLeft: accent ? `2px solid ${accent}` : undefined,
      }}
    >
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {agent && (
              <>
                <Monogram agent={agent} size={20} />
                <span className="font-medium text-[color:var(--text-primary)]">
                  {agent.name}
                </span>
              </>
            )}
            <span className="flex items-center gap-1 text-[color:var(--text-tertiary)] ml-1.5">
              <span className={`size-1.5 rounded-full ${badge.dot}`} />
              {badge.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePin}
              title={pinned ? "Pinned" : "Pin this insight"}
              className={`size-7 rounded-md flex items-center justify-center text-sm transition-all ${
                pinned
                  ? "bg-[color:var(--accent)]/20 text-[color:var(--accent)] scale-110"
                  : "hover:bg-[color:var(--muted)]"
              }`}
            >
              📌
            </button>
            <button
              onClick={handleCopy}
              title="Copy as Slack message"
              className="size-7 rounded-md flex items-center justify-center text-sm hover:bg-[color:var(--muted)]"
            >
              {copied ? "✓" : "📤"}
            </button>
          </div>
        </div>
        <div className="text-base font-semibold leading-snug">{insight.title}</div>
        <div className="text-sm text-[color:var(--foreground)]/90 leading-relaxed">
          <MarkdownMessage content={insight.body} />
        </div>
        <div
          className="text-xs rounded-md px-3 py-2 mt-2 border border-[color:var(--border)] bg-[color:var(--surface-elevated)]"
        >
          <span className="text-[color:var(--text-tertiary)] font-mono uppercase tracking-[0.06em] text-[10px] mr-1.5">
            Action
          </span>
          <span className="text-[color:var(--text-primary)]">
            {insight.recommended_action}
          </span>
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

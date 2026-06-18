"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  Database,
  Flame,
  Layers,
  PlayCircle,
  Sparkles,
  Tag,
  Users,
  Wrench,
} from "lucide-react";
import {
  COMPLEXITY_LABELS,
  FUNNEL_LABELS,
  industryLabel,
  normalizeAgentPersona,
  roleLabel,
  type LibraryBrief,
} from "@/lib/library/types";

const AGENT_TONE: Record<string, string> = {
  maya: "var(--agent-maya)",
  arjun: "var(--agent-arjun)",
  priya: "var(--agent-priya)",
  kabir: "var(--agent-kabir)",
  raavi: "var(--agent-raavi)",
  vera: "var(--agent-vera)",
};

export type PastRun = {
  id: number;
  title: string;
  status: string;
  pinned: boolean;
  created_at: number;
  completed_at: number | null;
};

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

export function BriefDetailClient({
  brief,
  pastRuns = [],
}: {
  brief: LibraryBrief;
  pastRuns?: PastRun[];
}) {
  const router = useRouter();
  const agentId = normalizeAgentPersona(brief.agent_persona);
  const agentTone = AGENT_TONE[agentId] ?? "var(--text-secondary)";

  function runInChat() {
    const primaryMetrics = brief.metrics
      .filter((m) => m.is_primary)
      .map((m) => `${m.name} (${m.type})`)
      .join(", ");
    const allMetrics = brief.metrics.map((m) => m.name).join(", ");
    const dims = brief.dimensions.map((d) => d.name).join(", ");
    const sources = brief.data_sources.map((s) => `${s.name} (${s.type})`).join(", ");

    const ask = `Run the "${brief.name}" brief for ${industryLabel(brief.industry.primary)}.

CONTEXT (template ${brief.id}):
${brief.detailed_description}

PRIMARY METRICS to compute: ${primaryMetrics || allMetrics}
DIMENSIONS to slice by: ${dims}
EXPECTED DATA SOURCES: ${sources}

Use whatever you can pull from GA4 (and Google Ads if connected). Where a dimension or metric isn't directly available, propose the closest GA4 equivalent and note the substitution. Format the response as a brief with: KPI strip → main table/chart → 3-5 specific actions.`.trim();

    const sp = new URLSearchParams({ agent: agentId, ask });
    router.push(`/chat/new?${sp.toString()}`);
  }

  function copyPrompt() {
    const txt = brief.detailed_description;
    navigator.clipboard.writeText(txt);
  }

  return (
    <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[920px] py-6 lg:py-8">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover mb-4"
      >
        <ArrowLeft strokeWidth={1.5} className="size-3" />
        Library
      </Link>

      <header className="mb-6 flex items-baseline justify-between flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] flex items-center gap-2 flex-wrap">
            <span>{industryLabel(brief.industry.primary)}</span>
            {brief.industry.secondary?.map((s) => (
              <span
                key={s}
                className="text-[color:var(--text-tertiary)]"
              >
                · {industryLabel(s)}
              </span>
            ))}
            {brief.is_popular && (
              <span
                className="ml-1 inline-flex items-center gap-1"
                style={{ color: "var(--severity-medium)" }}
              >
                <Flame strokeWidth={1.5} className="size-3" /> Popular
              </span>
            )}
            {brief.is_new && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px]"
                style={{
                  background: "rgba(126, 170, 138, 0.12)",
                  color: "var(--severity-low)",
                }}
              >
                NEW
              </span>
            )}
          </div>
          <h1 className="font-serif text-[28px] font-medium tracking-[-0.02em] leading-[1.1] mt-1.5">
            {brief.name}
          </h1>
          <p className="text-[14px] text-[color:var(--text-secondary)] mt-2 leading-relaxed max-w-[680px]">
            {brief.one_line_summary}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={copyPrompt}
            className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] inline-flex items-center gap-1.5"
          >
            Copy prompt
          </button>
          <button
            onClick={runInChat}
            className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[13px] font-medium inline-flex items-center gap-1.5"
          >
            <PlayCircle strokeWidth={1.5} className="size-4" />
            Run this brief
          </button>
        </div>
      </header>

      {/* Past runs of THIS brief */}
      {pastRuns.length > 0 && (
        <section className="mb-6">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
            Your runs of this brief ({pastRuns.length})
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
            {pastRuns.slice(0, 8).map((r, i) => (
              <Link
                key={r.id}
                href={`/briefs/${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-[color:var(--surface-hover)] tx-hover border-b border-[color:var(--border)] last:border-b-0"
              >
                <span
                  className="size-1.5 rounded-full shrink-0"
                  style={{
                    background:
                      r.status === "completed"
                        ? "#7c6bff"
                        : r.status === "running"
                        ? "#facc15"
                        : "#cfcfcf",
                    boxShadow:
                      r.status === "completed"
                        ? "0 0 5px rgba(124,107,255,0.5)"
                        : undefined,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium truncate">{r.title}</div>
                  <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
                    {r.status === "completed"
                      ? `ran ${timeAgo(r.completed_at ?? r.created_at)}`
                      : r.status}
                  </div>
                </div>
                {r.pinned && (
                  <span className="text-[10px] font-mono text-[color:var(--text-tertiary)] shrink-0">
                    pinned
                  </span>
                )}
                {i === 0 && r.status === "completed" && (
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded"
                    style={{
                      color: "#7c6bff",
                      background: "rgba(124,107,255,0.08)",
                      border: "1px solid rgba(124,107,255,0.3)",
                    }}
                  >
                    latest
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Meta strip */}
      <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetaItem
          label="Agent"
          value={
            agentId === "any"
              ? "Any"
              : agentId.charAt(0).toUpperCase() + agentId.slice(1)
          }
          tone={agentTone}
        />
        <MetaItem
          label="Funnel stage"
          value={
            brief.funnel_stage
              ? FUNNEL_LABELS[brief.funnel_stage] ?? brief.funnel_stage
              : "—"
          }
        />
        <MetaItem
          label="Complexity"
          value={
            brief.complexity
              ? COMPLEXITY_LABELS[brief.complexity] ?? brief.complexity
              : "—"
          }
        />
        <MetaItem
          label="Read time"
          value={`${brief.estimated_read_time_minutes} min`}
          icon={Clock}
        />
      </section>

      {/* Description */}
      <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 mb-6">
        <h2 className="font-serif text-[16px] font-medium mb-3">About</h2>
        <div className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
          {brief.detailed_description}
        </div>
      </section>

      {/* Metrics */}
      {brief.metrics.length > 0 && (
        <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 mb-6">
          <h2 className="font-serif text-[16px] font-medium mb-3 flex items-center gap-2">
            <Sparkles strokeWidth={1.5} className="size-4 text-[color:var(--text-secondary)]" />
            Metrics
          </h2>
          <ul className="space-y-2.5">
            {brief.metrics.map((m) => (
              <li key={m.name} className="text-[13px]">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] text-[color:var(--text-primary)]">
                    {m.name}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)]">
                    {m.type}
                  </span>
                  {m.is_primary && (
                    <span
                      className="text-[10px] font-mono uppercase tracking-[0.06em] px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
                  {m.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Dimensions */}
      {brief.dimensions.length > 0 && (
        <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 mb-6">
          <h2 className="font-serif text-[16px] font-medium mb-3 flex items-center gap-2">
            <Layers strokeWidth={1.5} className="size-4 text-[color:var(--text-secondary)]" />
            Dimensions
          </h2>
          <ul className="space-y-2.5">
            {brief.dimensions.map((d) => (
              <li key={d.name} className="text-[13px]">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] text-[color:var(--text-primary)]">
                    {d.name}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)]">
                    {d.type}
                  </span>
                </div>
                <p className="text-[12px] text-[color:var(--text-secondary)] mt-0.5 leading-relaxed">
                  {d.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Data sources */}
      {brief.data_sources.length > 0 && (
        <section className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 mb-6">
          <h2 className="font-serif text-[16px] font-medium mb-3 flex items-center gap-2">
            <Database strokeWidth={1.5} className="size-4 text-[color:var(--text-secondary)]" />
            Data sources
          </h2>
          <ul className="space-y-2">
            {brief.data_sources.map((s) => (
              <li
                key={s.name}
                className="flex items-baseline gap-2 text-[13px]"
              >
                <span className="font-mono text-[12px] text-[color:var(--text-primary)]">
                  {s.name}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)]">
                  {s.type}
                </span>
                {s.description && (
                  <span className="text-[12px] text-[color:var(--text-secondary)]">
                    — {s.description}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sidebar-ish meta in inline grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {brief.roles.length > 0 && (
          <TagBlock
            icon={Users}
            label="Built for"
            items={brief.roles.map(roleLabel)}
          />
        )}
        {brief.use_case_tags.length > 0 && (
          <TagBlock
            icon={Tag}
            label="Use cases"
            items={brief.use_case_tags.map((t) => t.replace(/_/g, " "))}
          />
        )}
        {brief.collections.length > 0 && (
          <TagBlock
            icon={Layers}
            label="Collections"
            items={brief.collections.map((c) => c.replace(/-/g, " "))}
          />
        )}
        {brief.customization_required && (
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] mb-1.5">
              <Wrench strokeWidth={1.5} className="size-3.5" />
              Heads up
            </div>
            <p className="text-[12px] text-[color:var(--text-secondary)] leading-relaxed">
              This brief expects custom dimensions or events. The agent will
              propose substitutions where direct mappings aren&apos;t available.
            </p>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-3 pt-3 border-t border-[color:var(--border)]">
        <div className="text-[11px] font-mono text-[color:var(--text-tertiary)]">
          {brief.id} · v{brief.version} · schedule: {brief.schedule}
        </div>
        <button
          onClick={runInChat}
          className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[13px] font-medium inline-flex items-center gap-1.5"
        >
          <ArrowUpRight strokeWidth={1.5} className="size-4" />
          Run this brief
        </button>
      </div>
    </div>
  );
}

function MetaItem({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] flex items-center gap-1.5">
        {Icon && <Icon strokeWidth={1.5} className="size-3" />}
        {label}
      </div>
      <div
        className="font-mono text-[14px] mt-1"
        style={{ color: tone ?? "var(--text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}

function TagBlock({
  icon: Icon,
  label,
  items,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] mb-2">
        <Icon strokeWidth={1.5} className="size-3.5" />
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span
            key={t}
            className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[color:var(--surface-elevated)] text-[color:var(--text-secondary)]"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

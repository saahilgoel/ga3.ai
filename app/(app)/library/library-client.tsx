"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Sparkles,
  Flame,
  X,
  Library as LibraryIcon,
  ArrowUpRight,
} from "lucide-react";
import {
  COMPLEXITY_LABELS,
  FUNNEL_LABELS,
  normalizeAgentPersona,
} from "@/lib/library/types";

type BriefItem = {
  id: string;
  slug: string;
  name: string;
  industry_primary: string;
  funnel_stage: string | null;
  agent_persona: string | null;
  complexity: string | null;
  one_line_summary: string;
  estimated_read_time_minutes: number;
  is_popular: boolean;
  is_new: boolean;
  customization_required: boolean;
  geo: string;
};

type Facet = { value: string; count: number };

type LibraryResponse = {
  rows: BriefItem[];
  total: number;
  facets: {
    industries: Facet[];
    funnel_stages: Facet[];
    complexities: Facet[];
    roles: Facet[];
    agent_personas: Facet[];
    collections: Facet[];
    geos: Facet[];
  };
};

const AGENT_TONE: Record<string, string> = {
  maya: "var(--agent-maya)",
  arjun: "var(--agent-arjun)",
  priya: "var(--agent-priya)",
  kabir: "var(--agent-kabir)",
  raavi: "var(--agent-raavi)",
  vera: "var(--agent-vera)",
};

const COMPLEXITY_TONE: Record<string, string> = {
  beginner: "var(--severity-low)",
  intermediate: "var(--severity-medium)",
  advanced: "var(--severity-high)",
};

type RecentRun = {
  id: number;
  template_id: string;
  title: string;
  status: string;
  pinned: boolean;
  created_at: number;
  completed_at: number | null;
};

export function LibraryClient() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [funnel, setFunnel] = useState<string[]>([]);
  const [complexities, setComplexities] = useState<string[]>([]);
  const [popularOnly, setPopularOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);

  // Pull recent runs once. They show as a horizontal strip above the grid.
  useEffect(() => {
    fetch("/api/briefs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { briefs?: RecentRun[] } | null) => {
        if (!data?.briefs) return;
        // Only completed runs (don't show running/failed in the recent strip)
        setRecent(data.briefs.filter((b) => b.status === "completed").slice(0, 6));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    for (const v of funnel) sp.append("funnel_stage", v);
    for (const v of complexities) sp.append("complexity", v);
    if (popularOnly) sp.set("popular", "1");
    if (newOnly) sp.set("is_new", "1");
    fetch(`/api/library?${sp.toString()}`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) return;
        setData((await r.json()) as LibraryResponse);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          console.error("[library] fetch failed:", err);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [q, funnel, complexities, popularOnly, newOnly]);

  const activeFilters =
    funnel.length +
    complexities.length +
    (popularOnly ? 1 : 0) +
    (newOnly ? 1 : 0);

  function clearAll() {
    setQ("");
    setFunnel([]);
    setComplexities([]);
    setPopularOnly(false);
    setNewOnly(false);
  }

  return (
    <div className="flex h-full">
      {/* Filter rail */}
      <aside className="w-[240px] shrink-0 border-r border-[color:var(--border)] bg-[color:var(--surface)] overflow-y-auto hidden md:block">
        <div className="px-4 py-4">
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] mb-2">
            Filters
          </div>
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setPopularOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono tx-hover ${
                popularOnly
                  ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
              }`}
            >
              <Flame strokeWidth={1.5} className="size-3" /> Popular
            </button>
            <button
              onClick={() => setNewOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono tx-hover ${
                newOnly
                  ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
              }`}
            >
              <Sparkles strokeWidth={1.5} className="size-3" /> New
            </button>
          </div>

          {activeFilters > 0 && (
            <button
              onClick={clearAll}
              className="w-full text-[11px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover mb-3 flex items-center gap-1.5"
            >
              <X strokeWidth={1.5} className="size-3" />
              Clear {activeFilters} filter{activeFilters === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {data && (
          <>
            <FacetGroup
              label="Funnel stage"
              facets={data.facets.funnel_stages}
              selected={funnel}
              onToggle={(v) =>
                setFunnel((cur) =>
                  cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
                )
              }
              labelFor={(v) => FUNNEL_LABELS[v] ?? v}
            />
            <FacetGroup
              label="Complexity"
              facets={data.facets.complexities}
              selected={complexities}
              onToggle={(v) =>
                setComplexities((cur) =>
                  cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
                )
              }
              labelFor={(v) => COMPLEXITY_LABELS[v] ?? v}
            />
          </>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1200px] py-6">
          <header className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
                Library
              </div>
              <h1 className="font-mono text-[28px] font-medium tracking-[-0.02em] leading-[1.1] mt-1 flex items-center gap-2.5">
                <LibraryIcon
                  strokeWidth={1.5}
                  className="size-6 text-[color:var(--text-secondary)]"
                />
                Brief Library
              </h1>
              <p className="text-[13px] text-[color:var(--text-secondary)] mt-1.5 max-w-[680px]">
                One-click reports for the questions marketers actually ask of GA4.
                Pick one, hand it to an agent, and it runs against your live data.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {data && (
                <div className="text-[11px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
                  {data.total} {data.total === 1 ? "brief" : "briefs"}
                </div>
              )}
            </div>
          </header>

          {/* Search */}
          <div className="relative mb-6">
            <Search
              strokeWidth={1.5}
              className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-tertiary)] pointer-events-none"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, summary, or use-case…"
              className="w-full h-10 pl-10 pr-3 rounded-lg bg-[color:var(--surface)] border border-[color:var(--border)] text-[13px] text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] focus:outline-none focus:border-[color:var(--border-strong)]"
            />
          </div>

          {/* Recent runs strip — your latest reports across all templates */}
          {recent.length > 0 && (
            <section className="mb-8">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
                Your recent runs
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {recent.map((r) => (
                  <Link
                    key={r.id}
                    href={`/briefs/${r.id}`}
                    className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2.5 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--accent)]/40 tx-hover flex items-center gap-3"
                  >
                    <span
                      className="size-1.5 rounded-full shrink-0"
                      style={{
                        background: "#7c6bff",
                        boxShadow: "0 0 5px rgba(124,107,255,0.55)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[13px] font-medium truncate">
                        {r.title}
                      </div>
                      <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
                        ran {timeAgo(r.completed_at ?? r.created_at)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Grid */}
          {loading && !data ? (
            <SkeletonGrid />
          ) : data && data.rows.length === 0 ? (
            <EmptyState onClear={clearAll} hasFilters={activeFilters > 0} />
          ) : (
            <Grid items={data?.rows ?? []} />
          )}
        </div>
      </div>
    </div>
  );
}

function timeAgo(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function FacetGroup({
  label,
  facets,
  selected,
  onToggle,
  labelFor,
}: {
  label: string;
  facets: Facet[];
  selected: string[];
  onToggle: (v: string) => void;
  labelFor: (v: string) => string;
}) {
  const [expanded, setExpanded] = useState(true);
  const shown = useMemo(() => {
    if (expanded || facets.length <= 6) return facets;
    return facets.slice(0, 6);
  }, [facets, expanded]);
  return (
    <div className="px-4 pb-4 border-t border-[color:var(--border)] pt-3">
      <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)] mb-2">
        {label}
      </div>
      <ul className="space-y-0.5">
        {shown.map((f) => (
          <li key={f.value}>
            <button
              onClick={() => onToggle(f.value)}
              className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-[12px] tx-hover text-left ${
                selected.includes(f.value)
                  ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              <span
                aria-hidden
                className="size-3 rounded border flex items-center justify-center shrink-0"
                style={{
                  borderColor: selected.includes(f.value)
                    ? "var(--text-primary)"
                    : "var(--border-strong)",
                  background: selected.includes(f.value)
                    ? "var(--text-primary)"
                    : "transparent",
                }}
              >
                {selected.includes(f.value) && (
                  <span className="size-1.5 rounded-sm bg-[color:var(--bg)]" />
                )}
              </span>
              <span className="flex-1 truncate">{labelFor(f.value)}</span>
              <span className="font-mono tabular-nums text-[10px] text-[color:var(--text-tertiary)]">
                {f.count}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {facets.length > 6 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[10px] font-mono text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] tx-hover"
        >
          {expanded ? "Show less" : `Show ${facets.length - 6} more`}
        </button>
      )}
    </div>
  );
}

function Grid({ items }: { items: BriefItem[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((b) => (
        <Card key={b.id} brief={b} />
      ))}
    </div>
  );
}

function Card({ brief }: { brief: BriefItem }) {
  const agentId = normalizeAgentPersona(brief.agent_persona);
  const agentTone = AGENT_TONE[agentId] ?? "var(--text-secondary)";
  const compTone =
    COMPLEXITY_TONE[brief.complexity ?? ""] ?? "var(--text-tertiary)";

  return (
    <Link
      href={`/library/${brief.slug}`}
      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover group flex flex-col"
    >
      <div className="flex items-center gap-2 flex-wrap mb-2 text-[10px] font-mono uppercase tracking-[0.06em]">
        {brief.funnel_stage && (
          <span className="text-[color:var(--text-secondary)]">
            {FUNNEL_LABELS[brief.funnel_stage] ?? brief.funnel_stage}
          </span>
        )}
        <span className="flex-1" />
        {brief.is_popular && (
          <Flame
            strokeWidth={1.5}
            className="size-3"
            style={{ color: "var(--severity-medium)" }}
          />
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

      <div className="font-mono text-[16px] font-medium leading-snug mb-1.5 flex items-start gap-1.5">
        <span className="flex-1">{brief.name}</span>
        <ArrowUpRight
          strokeWidth={1.5}
          className="size-3.5 mt-0.5 text-[color:var(--text-tertiary)] shrink-0 opacity-0 group-hover:opacity-100 tx-hover"
        />
      </div>
      <p className="text-[12px] text-[color:var(--text-secondary)] leading-relaxed line-clamp-3 mb-3 min-h-[3.6em]">
        {brief.one_line_summary}
      </p>

      <div className="flex items-center gap-2 flex-wrap mt-auto pt-2 border-t border-[color:var(--border)]">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.06em]"
          style={{ color: agentTone }}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: agentTone }}
          />
          {agentId === "any"
            ? "Any agent"
            : agentId.charAt(0).toUpperCase() + agentId.slice(1)}
        </span>
        {brief.complexity && (
          <span
            className="text-[10px] font-mono uppercase tracking-[0.06em]"
            style={{ color: compTone }}
          >
            {COMPLEXITY_LABELS[brief.complexity] ?? brief.complexity}
          </span>
        )}
        <span className="text-[10px] font-mono tabular-nums text-[color:var(--text-tertiary)] ml-auto">
          {brief.estimated_read_time_minutes} min
        </span>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 animate-pulse"
        >
          <div className="h-3 w-24 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-5 w-3/4 rounded bg-[color:var(--surface-elevated)] mt-2" />
          <div className="h-3 w-full rounded bg-[color:var(--surface-elevated)] mt-2" />
          <div className="h-3 w-5/6 rounded bg-[color:var(--surface-elevated)] mt-1.5" />
          <div className="h-3 w-1/3 rounded bg-[color:var(--surface-elevated)] mt-3" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  onClear,
  hasFilters,
}: {
  onClear: () => void;
  hasFilters: boolean;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center">
      <div className="font-mono text-[18px] font-medium">No briefs match</div>
      <p className="text-[13px] text-[color:var(--text-secondary)] mt-2">
        {hasFilters
          ? "Try clearing some filters or widening your search."
          : "The library is empty — seed data may not have loaded."}
      </p>
      {hasFilters && (
        <button
          onClick={onClear}
          className="mt-4 h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px]"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}

"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  StoredRun,
  RecommendationsPayload,
} from "@/lib/context/ai-visibility";

type Props = {
  initialRuns: StoredRun[];
  initialRecommendations: RecommendationsPayload | null;
  ownBrand: string;
  category: string | null;
  competitorNames: string[];
};

const SURFACE_COLOR: Record<string, string> = {
  ai_mode: "#7c6bff",
  chatgpt: "#a78bfa",
};

function rgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function AiVisibilityClient({
  initialRuns,
  initialRecommendations,
  ownBrand,
  category,
  competitorNames,
}: Props) {
  const [runs, setRuns] = useState<StoredRun[]>(initialRuns);
  const [recommendations, setRecommendations] =
    useState<RecommendationsPayload | null>(initialRecommendations);
  const [running, setRunning] = useState(false);
  const [selectedRun, setSelectedRun] = useState<StoredRun | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/ai-visibility", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as {
      runs: StoredRun[];
      recommendations: RecommendationsPayload | null;
    };
    setRuns(data.runs);
    setRecommendations(data.recommendations);
  }, []);

  async function run() {
    setRunning(true);
    await fetch("/api/ai-visibility/run", { method: "POST" });
    // Poll for new data
    const interval = setInterval(async () => {
      await refresh();
    }, 6_000);
    setTimeout(() => {
      clearInterval(interval);
      setRunning(false);
    }, 5 * 60_000); // safety cutoff
  }

  // Build the matrix: rows = prompts × surfaces, cols = brands (own first, then competitors, then "other")
  const matrix = useMemo(() => {
    // Collect every distinct brand mentioned anywhere in all runs
    const lower = (s: string) => s.toLowerCase().trim();
    const brandSet = new Map<string, { display: string; isOwn: boolean; isCompetitor: boolean }>();
    brandSet.set(lower(ownBrand), { display: ownBrand, isOwn: true, isCompetitor: false });
    for (const c of competitorNames) {
      brandSet.set(lower(c), { display: c, isOwn: false, isCompetitor: true });
    }
    for (const r of runs) {
      for (const b of r.brands) {
        if (!brandSet.has(lower(b.brand))) {
          brandSet.set(lower(b.brand), {
            display: b.brand,
            isOwn: b.is_own,
            isCompetitor: b.is_competitor,
          });
        }
      }
    }
    // Order columns: own first, then competitors (by total mentions desc), then others
    const tallies = new Map<string, number>();
    for (const r of runs) {
      for (const b of r.brands) {
        tallies.set(lower(b.brand), (tallies.get(lower(b.brand)) ?? 0) + 1);
      }
    }
    const cols = [...brandSet.entries()].sort((a, b) => {
      if (a[1].isOwn !== b[1].isOwn) return a[1].isOwn ? -1 : 1;
      if (a[1].isCompetitor !== b[1].isCompetitor) return a[1].isCompetitor ? -1 : 1;
      return (tallies.get(b[0]) ?? 0) - (tallies.get(a[0]) ?? 0);
    });
    return { cols, tallies };
  }, [runs, ownBrand, competitorNames]);

  // Per-brand visibility score (% of runs where the brand is mentioned)
  const visibility = useMemo(() => {
    const total = runs.length || 1;
    const scores: Array<{ brand: string; display: string; pct: number; avgPos: number; isOwn: boolean; isCompetitor: boolean; recommendedCount: number }> = [];
    for (const [key, meta] of matrix.cols) {
      let mentions = 0;
      const positions: number[] = [];
      let recommended = 0;
      for (const r of runs) {
        const found = r.brands.find((b) => b.brand.toLowerCase().trim() === key);
        if (found) {
          mentions += 1;
          positions.push(found.position);
          if (found.recommended) recommended += 1;
        }
      }
      const avgPos =
        positions.length > 0
          ? positions.reduce((s, v) => s + v, 0) / positions.length
          : 0;
      scores.push({
        brand: key,
        display: meta.display,
        pct: Math.round((mentions / total) * 100),
        avgPos,
        isOwn: meta.isOwn,
        isCompetitor: meta.isCompetitor,
        recommendedCount: recommended,
      });
    }
    return scores;
  }, [runs, matrix]);

  const ownScore = visibility.find((v) => v.isOwn);

  // Top domains AI Mode cites for our prompts — the placements to win.
  const topCitedDomains = useMemo(() => {
    const counter = new Map<string, { count: number; sample: string }>();
    for (const r of runs) {
      if (r.surface !== "ai_mode") continue;
      for (const c of r.citations ?? []) {
        try {
          const host = new URL(c.url).hostname.replace(/^www\./, "").toLowerCase();
          const cur = counter.get(host) ?? { count: 0, sample: "" };
          cur.count += 1;
          if (!cur.sample && c.snippet) cur.sample = c.snippet.slice(0, 120);
          counter.set(host, cur);
        } catch {
          /* bad url */
        }
      }
    }
    return [...counter.entries()]
      .map(([host, v]) => ({ host, count: v.count, sample: v.sample }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [runs]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] py-6 lg:py-8">
        <header className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] mb-2">
              GEO · AI search visibility
            </div>
            <h1 className="font-serif text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] leading-[1.05]">
              Are you visible in AI answers?
            </h1>
            <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 max-w-xl">
              We ask Google AI Search + ChatGPT a set of category prompts and
              count how often <span className="font-medium text-[color:var(--text-primary)]">{ownBrand}</span> shows up vs your competitors.
              {category && (
                <span> Category detected: <span className="font-mono text-[11px]">{category}</span>.</span>
              )}
            </p>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="h-10 px-4 rounded-md text-[12px] font-medium tx-hover"
            style={{
              color: "var(--accent-foreground)",
              background: "var(--accent)",
              boxShadow: running
                ? "0 0 14px rgba(124,107,255,0.5)"
                : "0 0 24px -4px var(--accent)",
            }}
          >
            {running ? "Running… (~2 min)" : runs.length === 0 ? "Run first scan" : "Re-run scan"}
          </button>
        </header>

        {runs.length === 0 && !running && (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center">
            <div className="text-[14px] font-medium mb-1">No AI visibility data yet</div>
            <div className="text-[12px] text-[color:var(--text-secondary)] max-w-md mx-auto">
              Click <span className="font-mono">Run first scan</span> above. We&apos;ll auto-generate
              5-7 buyer-intent prompts and check how often each brand shows up in
              Google AI Search + ChatGPT.
            </div>
          </div>
        )}

        {runs.length > 0 && (
          <>
            {/* Hero score */}
            {ownScore && (
              <div className="rounded-xl border border-[color:var(--border)] bg-black/40 p-5 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <Stat
                  label="Your brand visibility"
                  value={`${ownScore.pct}%`}
                  hint={`mentioned in ${ownScore.pct}% of ${runs.length} AI answers`}
                  color="#7c6bff"
                  big
                />
                <Stat
                  label="Avg rank when mentioned"
                  value={ownScore.avgPos ? `#${ownScore.avgPos.toFixed(1)}` : "—"}
                  hint="lower = appears earlier in the answer"
                  color="#facc15"
                />
                <Stat
                  label="Explicit recommendations"
                  value={String(ownScore.recommendedCount)}
                  hint={`answers where AI named ${ownBrand} as a top pick`}
                  color="#cfcfcf"
                />
              </div>
            )}

            {/* Recommendations — what should you do? */}
            {recommendations && recommendations.cards.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)]">
                    Recommendations · what to do next
                  </div>
                  <div className="text-[10px] font-mono text-[color:var(--text-tertiary)]">
                    generated {timeAgo(recommendations.generated_at)}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommendations.cards.map((c, i) => {
                    const effortColor =
                      c.effort === "low"
                        ? "#7c6bff"
                        : c.effort === "medium"
                        ? "#facc15"
                        : "#cfcfcf";
                    const impactColor =
                      c.impact === "high"
                        ? "#7c6bff"
                        : c.impact === "medium"
                        ? "#facc15"
                        : "#94a3b8";
                    return (
                      <div
                        key={i}
                        className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                        style={{
                          boxShadow: c.impact === "high"
                            ? "0 0 0 1px rgba(124,107,255,0.18), 0 0 18px -6px rgba(124,107,255,0.3)"
                            : undefined,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="font-serif text-[16px] font-medium tracking-[-0.01em] leading-tight">
                            {c.title}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span
                              className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{
                                color: effortColor,
                                background: rgba(effortColor, 0.08),
                                border: `1px solid ${rgba(effortColor, 0.3)}`,
                              }}
                            >
                              {c.effort} effort
                            </span>
                            <span
                              className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded"
                              style={{
                                color: impactColor,
                                background: rgba(impactColor, 0.08),
                                border: `1px solid ${rgba(impactColor, 0.3)}`,
                              }}
                            >
                              {c.impact} impact
                            </span>
                          </div>
                        </div>
                        <p className="text-[12px] text-[color:var(--text-secondary)] leading-relaxed mb-3">
                          {c.rationale}
                        </p>
                        <ul className="space-y-1 mb-3">
                          {c.action_items.map((it, j) => (
                            <li
                              key={j}
                              className="text-[12px] text-[color:var(--text-primary)] flex items-start gap-2"
                            >
                              <span
                                className="mt-1.5 size-1.5 rounded-full shrink-0"
                                style={{
                                  background: "#7c6bff",
                                  boxShadow: "0 0 4px #7c6bff",
                                }}
                              />
                              <span>{it}</span>
                            </li>
                          ))}
                        </ul>
                        <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] border-t border-[color:var(--border)] pt-2 italic">
                          {c.evidence}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Top cited domains — where the AI gets its info */}
            {topCitedDomains.length > 0 && (
              <section className="mb-6">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
                  Top sources AI Mode cites · the placements to win
                </div>
                <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
                  {topCitedDomains.map((d, i) => (
                    <a
                      key={d.host}
                      href={`https://${d.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-hover)] tx-hover"
                    >
                      <span className="text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums w-6 text-right">
                        {i + 1}
                      </span>
                      <span
                        className="text-[12px] font-mono w-44 shrink-0 truncate"
                        style={{
                          color: "#7c6bff",
                          textShadow: "0 0 4px rgba(124,107,255,0.4)",
                        }}
                      >
                        {d.host}
                      </span>
                      <span className="text-[11px] text-[color:var(--text-secondary)] truncate flex-1">
                        {d.sample || "—"}
                      </span>
                      <span
                        className="font-mono tabular-nums text-[12px] shrink-0"
                        style={{ color: "#7c6bff" }}
                      >
                        {d.count}×
                      </span>
                    </a>
                  ))}
                </div>
                <div className="mt-2 text-[10px] font-mono text-[color:var(--text-tertiary)]">
                  These are the URLs AI Mode actually opens to answer category
                  questions. If your brand isn&apos;t mentioned on them, that&apos;s
                  why you&apos;re invisible.
                </div>
              </section>
            )}

            {/* Stack-rank */}
            <section className="mb-6">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
                Visibility stack-rank
              </div>
              <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
                {visibility
                  .sort((a, b) => b.pct - a.pct)
                  .slice(0, 12)
                  .map((v, i) => {
                    const color = v.isOwn ? "#7c6bff" : v.isCompetitor ? "#cfcfcf" : "#94a3b8";
                    return (
                      <div
                        key={v.brand}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-[color:var(--border)] last:border-b-0"
                        style={
                          v.isOwn
                            ? { background: rgba(color, 0.06) }
                            : undefined
                        }
                      >
                        <span className="text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums w-6 text-right">
                          {i + 1}
                        </span>
                        <span
                          className="text-[13px] font-medium truncate w-40 shrink-0"
                          style={{ color }}
                        >
                          {v.display}
                          {v.isOwn && (
                            <span className="ml-1.5 text-[9px] font-mono uppercase tracking-wider opacity-70">
                              you
                            </span>
                          )}
                        </span>
                        <div className="flex-1 h-[3px] rounded-full bg-[color:var(--surface-elevated)] overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${v.pct}%`,
                              background: color,
                              boxShadow: `0 0 6px ${color}, 0 0 12px ${rgba(color, 0.6)}`,
                            }}
                          />
                        </div>
                        <span
                          className="font-mono tabular-nums text-[12px] w-10 text-right"
                          style={{ color }}
                        >
                          {v.pct}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            </section>

            {/* Matrix */}
            <section className="mb-6">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
                Prompt × brand matrix
              </div>
              <div className="overflow-x-auto rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-[color:var(--border)]">
                      <th className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)] sticky left-0 bg-[color:var(--surface)]">
                        Prompt
                      </th>
                      <th className="px-2 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
                        Surface
                      </th>
                      {matrix.cols.slice(0, 10).map(([key, meta]) => (
                        <th
                          key={key}
                          className="px-2 py-2 text-center font-mono text-[10px] uppercase tracking-wider truncate max-w-[120px]"
                          style={{
                            color: meta.isOwn ? "#7c6bff" : meta.isCompetitor ? "#cfcfcf" : "var(--text-tertiary)",
                          }}
                        >
                          {meta.display}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelectedRun(r)}
                        className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-hover)] cursor-pointer"
                      >
                        <td className="px-3 py-2 text-[12px] truncate max-w-[240px] sticky left-0 bg-inherit">
                          {r.prompt}
                        </td>
                        <td
                          className="px-2 py-2 font-mono text-[10px] whitespace-nowrap"
                          style={{ color: SURFACE_COLOR[r.surface] }}
                        >
                          {r.surface === "ai_mode" ? "AI Mode" : "ChatGPT"}
                        </td>
                        {matrix.cols.slice(0, 10).map(([key, meta]) => {
                          const found = r.brands.find(
                            (b) => b.brand.toLowerCase().trim() === key
                          );
                          if (!found) {
                            return (
                              <td
                                key={key}
                                className="px-2 py-2 text-center text-[color:var(--text-tertiary)]"
                              >
                                —
                              </td>
                            );
                          }
                          const color = meta.isOwn ? "#7c6bff" : meta.isCompetitor ? "#cfcfcf" : "#94a3b8";
                          return (
                            <td
                              key={key}
                              className="px-2 py-2 text-center font-mono tabular-nums"
                            >
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full"
                                style={{
                                  color,
                                  background: rgba(color, 0.08),
                                  border: `1px solid ${rgba(color, 0.3)}`,
                                  textShadow: `0 0 4px ${rgba(color, 0.4)}`,
                                }}
                              >
                                #{found.position}
                                {found.recommended && <span>★</span>}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[10px] font-mono text-[color:var(--text-tertiary)]">
                Click any row to see the full AI response. ★ = brand was
                explicitly recommended/top-picked. # = position in the answer.
              </div>
            </section>
          </>
        )}

        {selectedRun && (
          <ResponseModal
            run={selectedRun}
            ownBrand={ownBrand}
            onClose={() => setSelectedRun(null)}
          />
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  color,
  big = false,
}: {
  label: string;
  value: string;
  hint?: string;
  color: string;
  big?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-1">
        {label}
      </div>
      <div
        className={`font-mono tabular-nums ${
          big ? "text-[48px]" : "text-[32px]"
        } font-medium leading-none`}
        style={{
          color,
          textShadow: `0 0 8px ${rgba(color, 0.45)}, 0 0 20px ${rgba(color, 0.25)}`,
        }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-[11px] text-[color:var(--text-tertiary)]">
          {hint}
        </div>
      )}
    </div>
  );
}

function ResponseModal({
  run,
  ownBrand,
  onClose,
}: {
  run: StoredRun;
  ownBrand: string;
  onClose: () => void;
}) {
  // Highlight own brand mentions in the response text
  const highlighted = useMemo(() => {
    const text = run.response_text;
    if (!text) return null;
    const safeBrand = ownBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${safeBrand})`, "gi");
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? (
        <mark
          key={i}
          style={{
            background: "rgba(124,107,255,0.18)",
            color: "#7c6bff",
            padding: "0 4px",
            borderRadius: 3,
            textShadow: "0 0 6px rgba(124,107,255,0.5)",
          }}
        >
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      )
    );
  }, [run.response_text, ownBrand]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      onClick={onClose}
    >
      <div aria-hidden className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <aside
        className="relative w-full max-w-[680px] h-full overflow-y-auto bg-[color:var(--bg)] border-l border-[color:var(--border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 bg-[color:var(--bg)]/85 backdrop-blur-md border-b border-[color:var(--border)] px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1"
                style={{ color: SURFACE_COLOR[run.surface] }}
              >
                {run.surface === "ai_mode" ? "Google AI Mode" : "ChatGPT"} · {timeAgo(run.ran_at)}
              </div>
              <h2 className="font-serif text-[20px] font-medium tracking-[-0.01em]">
                {run.prompt}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="size-8 rounded-md flex items-center justify-center text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </header>
        <div className="px-6 py-6">
          {run.brands.length > 0 && (
            <div className="mb-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-2">
                Brands mentioned, in order
              </div>
              <div className="flex flex-wrap gap-1.5">
                {run.brands.map((b, i) => {
                  const color = b.is_own ? "#7c6bff" : b.is_competitor ? "#cfcfcf" : "#94a3b8";
                  return (
                    <span
                      key={`${b.brand}-${i}`}
                      className="text-[11px] font-mono px-2 py-0.5 rounded-full border"
                      style={{
                        color,
                        borderColor: rgba(color, 0.4),
                        background: rgba(color, 0.06),
                        textShadow: `0 0 4px ${rgba(color, 0.5)}`,
                      }}
                    >
                      #{b.position} {b.brand}
                      {b.recommended && <span className="ml-1">★</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <div className="text-[13px] leading-relaxed text-[color:var(--text-secondary)] whitespace-pre-wrap">
            {highlighted}
          </div>
        </div>
      </aside>
    </div>
  );
}

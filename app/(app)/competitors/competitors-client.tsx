"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEventStream, type StreamEvent } from "@/lib/use-event-stream";
import type { CompetitorRow } from "@/lib/context/competitors-db";
import { CompetitorDetail } from "./competitor-detail";

type Props = {
  initial: CompetitorRow[];
  workspaceName: string;
};

const STATUS_COLOR: Record<string, string> = {
  ready: "#7c6bff",
  partial: "#facc15",
  crawling: "#a78bfa",
  pending: "#94a3b8",
  failed: "#cfcfcf",
};

function rgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function CompetitorsClient({ initial, workspaceName }: Props) {
  const [rows, setRows] = useState<CompetitorRow[]>(initial);
  const [selected, setSelected] = useState<CompetitorRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/context/competitors", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { competitors: CompetitorRow[] };
      setRows(data.competitors);
    } catch {
      /* ignore */
    }
  }, []);

  // Re-fetch when a competitor's status changes via SSE
  useEventStream(
    useCallback((ev: StreamEvent) => {
      if (ev.kind === "competitor.progress") {
        // Update inline rather than refetching everything
        setRows((prev) =>
          prev.map((c) =>
            c.id === ev.competitor_id
              ? {
                  ...c,
                  current_step: ev.step,
                  progress_pct: ev.pct,
                  status: ev.status === "ready" ? "ready" : ev.status === "failed" ? "failed" : "crawling",
                }
              : c
          )
        );
      }
    }, [])
  );

  // Periodic light refresh to catch credit/doc counts post-ingest
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshList();
    }, 30_000);
    return () => clearInterval(t);
  }, [refreshList]);

  async function refreshAll() {
    setRefreshing(true);
    await fetch("/api/context/competitors/refresh", { method: "POST" });
    setTimeout(() => setRefreshing(false), 2_000);
    refreshList();
  }

  async function deleteRow(id: number) {
    if (!confirm("Remove this competitor and all their data?")) return;
    await fetch("/api/context/competitors", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  const ready = useMemo(
    () => rows.filter((r) => r.status === "ready" || r.status === "partial").length,
    [rows]
  );
  const totalChunks = useMemo(
    () => rows.reduce((s, r) => s + r.chunk_count, 0),
    [rows]
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] py-6 lg:py-8">
        <header className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] mb-2">
              Competitive intelligence · {workspaceName}
            </div>
            <h1 className="font-mono text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] leading-[1.05]">
              Competitors
            </h1>
            <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 max-w-xl">
              {rows.length === 0
                ? "Detecting competitors. Once your brand context finishes, we'll auto-find up to 3 direct competitors and start studying them."
                : `${rows.length} tracked · ${ready} ready · ${totalChunks.toLocaleString("en-IN")} chunks ingested`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddOpen(true)}
              className="h-9 px-3 rounded-md border border-[color:var(--border)] text-[12px] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)]/60 hover:text-[color:var(--text-primary)] tx-hover"
            >
              + Add manually
            </button>
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="h-9 px-3 rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] text-[12px] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)]/60 hover:text-[color:var(--text-primary)] tx-hover disabled:opacity-60"
            >
              {refreshing ? "Refreshing…" : "Refresh all"}
            </button>
          </div>
        </header>

        {rows.length === 0 && (
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-10 text-center">
            <div
              className="inline-flex size-2 rounded-full neon-pulse mb-3"
              style={{
                background: "#a78bfa",
                boxShadow: "0 0 8px #a78bfa, 0 0 16px rgba(167,139,250,0.6)",
              }}
            />
            <div className="text-[14px] font-medium mb-1">
              No competitors detected yet
            </div>
            <div className="text-[12px] text-[color:var(--text-secondary)] max-w-md mx-auto">
              Auto-discovery runs once your own-brand context build hits 100%.
              Or add one manually using the button above.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((c) => {
            const color = STATUS_COLOR[c.status] ?? STATUS_COLOR.pending;
            const active = c.status === "crawling";
            const pct = c.progress_pct ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className="relative text-left rounded-lg border bg-[color:var(--surface)] p-4 transition-all duration-200 hover:bg-[color:var(--surface-hover)] focus:outline-none"
                style={{
                  borderColor:
                    c.status === "ready"
                      ? rgba(color, 0.5)
                      : "var(--border)",
                  boxShadow:
                    c.status === "ready"
                      ? `0 0 0 1px ${rgba(color, 0.2)}, 0 0 14px -2px ${rgba(color, 0.25)}`
                      : "none",
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[18px] font-medium tracking-[-0.01em] truncate">
                      {c.brand_name}
                    </div>
                    {c.website_url && (
                      <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] truncate">
                        {(() => {
                          try {
                            return new URL(c.website_url).hostname.replace(/^www\./, "");
                          } catch {
                            return c.website_url;
                          }
                        })()}
                      </div>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider shrink-0 px-2 py-0.5 rounded-full border`}
                    style={{
                      color,
                      borderColor: rgba(color, 0.4),
                      background: rgba(color, 0.06),
                    }}
                  >
                    <span
                      className={`size-1.5 rounded-full ${active ? "neon-pulse" : ""}`}
                      style={{
                        background: color,
                        boxShadow: `0 0 4px ${color}`,
                      }}
                    />
                    {c.status}
                  </span>
                </div>

                {c.reasoning && (
                  <div className="text-[12px] text-[color:var(--text-secondary)] line-clamp-2 mb-3">
                    {c.reasoning}
                  </div>
                )}

                <div className="flex items-center gap-3 text-[10px] font-mono text-[color:var(--text-tertiary)]">
                  <span>
                    {c.document_count} doc{c.document_count === 1 ? "" : "s"}
                  </span>
                  <span>·</span>
                  <span>{c.chunk_count} chunks</span>
                  <span>·</span>
                  <span>{c.credits_used} cr</span>
                  <span className="ml-auto">{timeAgo(c.ingested_at)}</span>
                </div>

                {active && (
                  <>
                    <div className="mt-3 text-[10px] font-mono" style={{ color }}>
                      {c.current_step ?? "…"} · {pct}%
                    </div>
                    <div className="mt-1 h-[2px] rounded-full bg-[color:var(--surface-elevated)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.max(2, Math.min(100, pct))}%`,
                          background: `linear-gradient(90deg, ${rgba(color, 0.3)}, ${color})`,
                          boxShadow: `0 0 6px ${color}`,
                        }}
                      />
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <CompetitorDetail
          competitor={selected}
          onClose={() => setSelected(null)}
          onDelete={() => deleteRow(selected.id)}
        />
      )}

      {addOpen && (
        <AddCompetitorModal
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            refreshList();
          }}
        />
      )}
    </div>
  );
}

function AddCompetitorModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [brand, setBrand] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (brand.trim().length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/context/competitors/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand_name: brand.trim(),
          website_url: website.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      onAdded();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        className="relative w-full max-w-md rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] mb-2">
          Add competitor
        </div>
        <h2 className="font-mono text-[20px] font-medium tracking-[-0.01em] mb-4">
          Track another brand
        </h2>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1 block">
              Brand name
            </label>
            <input
              autoFocus
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Mamaearth"
              className="w-full h-10 px-3 rounded-md bg-[color:var(--bg)] border border-[color:var(--border)] focus:border-[color:var(--accent)] focus:outline-none text-[13px]"
            />
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1 block">
              Website (optional)
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://mamaearth.in"
              className="w-full h-10 px-3 rounded-md bg-[color:var(--bg)] border border-[color:var(--border)] focus:border-[color:var(--accent)] focus:outline-none text-[13px]"
            />
          </div>
          {error && (
            <div className="text-[12px] text-[color:var(--severity-high)]">{error}</div>
          )}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-3 rounded-md text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || brand.trim().length < 2}
            className="h-9 px-4 rounded-md bg-[color:var(--accent)] text-[color:var(--accent-foreground)] text-[12px] font-medium disabled:opacity-50 hover:bg-[color:var(--accent-hover)] tx-hover"
          >
            {submitting ? "Adding…" : "Add and study"}
          </button>
        </div>
      </div>
    </div>
  );
}

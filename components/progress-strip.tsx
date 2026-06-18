"use client";

import { Component, useEffect, useState, type ReactNode } from "react";
import { useEventStream, type StreamEvent } from "@/lib/use-event-stream";

// Wrap the strip in a boundary — if anything inside throws, the chrome stays
// alive and the rest of the page still loads.
class StripBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[progress-strip] caught:", err.message);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function ProgressStrip() {
  return (
    <StripBoundary>
      <ProgressStripInner />
    </StripBoundary>
  );
}

type Track = {
  id: string;
  label: string;
  detail: string;
  pct: number;
  done: boolean;
  ts: number;
};

const FADE_AFTER_MS = 2500;

function ProgressStripInner() {
  const [tracks, setTracks] = useState<Record<string, Track>>({});
  const [bootstrapped, setBootstrapped] = useState(false);

  // Seed from current context status on mount so refresh mid-build still shows
  // the strip without waiting for the next event.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/context/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { status?: { status?: string; current_step?: string | null; progress_pct?: number; document_count?: number; chunk_count?: number } | null } | null) => {
        if (cancelled || !data?.status) return;
        const s = data.status;
        const inflight = s.status === "crawling" || s.status === "embedding" || s.status === "pending";
        if (!inflight) return;
        setTracks((prev) => ({
          ...prev,
          context: {
            id: "context",
            label: "Building context",
            detail: s.current_step || "starting",
            pct: Math.max(2, Math.min(99, s.progress_pct ?? 2)),
            done: false,
            ts: Date.now(),
          },
        }));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBootstrapped(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEventStream((ev: StreamEvent) => {
    if (ev.kind === "context.progress") {
      const done = ev.status === "ready" || ev.status === "partial" || ev.pct >= 100;
      setTracks((prev) => ({
        ...prev,
        context: {
          id: "context",
          label: "Building context",
          detail: ev.step,
          pct: Math.max(prev.context?.pct ?? 0, ev.pct),
          done,
          ts: Date.now(),
        },
      }));
    } else if (ev.kind === "scan.progress") {
      setTracks((prev) => ({
        ...prev,
        scan: {
          id: "scan",
          label: "Scanning workspace",
          detail: ev.phase,
          pct: Math.max(prev.scan?.pct ?? 0, ev.pct),
          done: false,
          ts: Date.now(),
        },
      }));
    } else if (ev.kind === "scan.completed") {
      setTracks((prev) => ({
        ...prev,
        scan: {
          id: "scan",
          label: "Scanning workspace",
          detail:
            ev.new_findings > 0
              ? `${ev.new_findings} new finding${ev.new_findings === 1 ? "" : "s"}`
              : "no new findings",
          pct: 100,
          done: true,
          ts: Date.now(),
        },
      }));
    } else if (ev.kind === "industry.progress") {
      const done = ev.status === "ready" || ev.status === "idle" || ev.pct >= 100;
      setTracks((prev) => ({
        ...prev,
        industry: {
          id: "industry",
          label: "Industry signals",
          detail: ev.step,
          pct: Math.max(prev.industry?.pct ?? 0, ev.pct),
          done,
          ts: Date.now(),
        },
      }));
    } else if (ev.kind === "competitor.progress") {
      const done = ev.status === "ready" || ev.status === "failed" || ev.pct >= 100;
      const key = `competitor:${ev.competitor_id}`;
      setTracks((prev) => ({
        ...prev,
        [key]: {
          id: key,
          label: `Studying ${ev.brand_name}`,
          detail: ev.step,
          pct: Math.max(prev[key]?.pct ?? 0, ev.pct),
          done,
          ts: Date.now(),
        },
      }));
    }
  });

  // Sweep finished tracks after their fade window.
  useEffect(() => {
    const t = setInterval(() => {
      setTracks((prev) => {
        const now = Date.now();
        let changed = false;
        const next: Record<string, Track> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.done && now - v.ts > FADE_AFTER_MS) {
            changed = true;
            continue;
          }
          next[k] = v;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const list = Object.values(tracks);
  if (list.length === 0) return null;
  // Avoid flashing the bootstrap row briefly with no data.
  if (!bootstrapped && list.every((t) => t.id === "context" && t.pct < 3)) return null;

  return (
    <div className="relative border-b border-[color:var(--border)] bg-black/60 backdrop-blur-sm">
      {list.map((t) => (
        <ProgressLine key={t.id} track={t} />
      ))}
    </div>
  );
}

// Per-track neon palette. Picked so they stay distinct on a dark surface
// and read as "live system" rather than UI chrome.
function neonFor(track: Track): { hex: string; rgba: string; soft: string } {
  if (track.id === "context")
    return { hex: "#7c6bff", rgba: "124,107,255", soft: "rgba(124,107,255,0.18)" };
  if (track.id === "scan")
    return { hex: "#a78bfa", rgba: "167,139,250", soft: "rgba(167,139,250,0.18)" };
  if (track.id === "industry")
    return { hex: "#facc15", rgba: "250,204,21", soft: "rgba(250,204,21,0.18)" };
  if (track.id.startsWith("competitor:"))
    return { hex: "#cfcfcf", rgba: "244,114,182", soft: "rgba(244,114,182,0.18)" };
  return { hex: "#7c6bff", rgba: "124,107,255", soft: "rgba(124,107,255,0.18)" };
}

function ProgressLine({ track }: { track: Track }) {
  const c = neonFor(track);
  const pct = Math.max(0, Math.min(100, track.pct));
  const active = !track.done;
  return (
    <div className="group relative h-7 px-4 lg:px-6 flex items-center gap-3 overflow-hidden">
      {/* Glowing dot */}
      <span
        aria-hidden
        className={`relative inline-block rounded-full ${active ? "neon-pulse" : ""}`}
        style={{
          width: 7,
          height: 7,
          background: c.hex,
          boxShadow: active
            ? `0 0 6px ${c.hex}, 0 0 14px ${c.hex}, 0 0 22px rgba(${c.rgba},0.55)`
            : `0 0 4px rgba(${c.rgba},0.5)`,
          opacity: track.done ? 0.7 : 1,
        }}
      />
      <div
        className="text-[11px] font-medium tracking-wide shrink-0"
        style={{
          color: c.hex,
          textShadow: active ? `0 0 6px rgba(${c.rgba},0.65)` : "none",
        }}
      >
        {track.label}
      </div>
      <div className="text-[11px] truncate min-w-0 flex-1" style={{ color: "rgba(255,255,255,0.78)" }}>
        {track.detail}
      </div>
      <div
        className="text-[10px] font-mono tabular-nums shrink-0"
        style={{
          color: c.hex,
          textShadow: active ? `0 0 4px rgba(${c.rgba},0.55)` : "none",
        }}
      >
        {pct}%
      </div>

      {/* Glowing progress rail */}
      <div
        className="absolute bottom-0 left-0 h-[2px] rounded-r-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${c.soft}, ${c.hex})`,
          boxShadow: active
            ? `0 0 6px ${c.hex}, 0 0 12px rgba(${c.rgba},0.6)`
            : `0 0 3px rgba(${c.rgba},0.4)`,
          opacity: track.done ? 0.45 : 1,
        }}
      />

      {/* Animated scan-line when active */}
      {active && (
        <span
          aria-hidden
          className="absolute bottom-0 h-[2px] w-12 neon-sweep rounded-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${c.hex}, transparent)`,
            filter: "blur(1px)",
            mixBlendMode: "screen",
          }}
        />
      )}
    </div>
  );
}

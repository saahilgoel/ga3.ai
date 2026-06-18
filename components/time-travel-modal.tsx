"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const PRESETS = [
  {
    id: "wow",
    label: "This week vs last week",
    a: { start: "7daysAgo", end: "today", label: "this week" },
    b: { start: "14daysAgo", end: "7daysAgo", label: "last week" },
  },
  {
    id: "mom",
    label: "Last 30 days vs prior 30 days",
    a: { start: "30daysAgo", end: "today", label: "last 30 days" },
    b: { start: "60daysAgo", end: "30daysAgo", label: "prior 30 days" },
  },
  {
    id: "yoy",
    label: "Last 7 days vs same week last year",
    a: { start: "7daysAgo", end: "today", label: "last 7 days" },
    b: { start: "372daysAgo", end: "365daysAgo", label: "same week last year" },
  },
];

export function TimeTravelModal({
  open,
  onClose,
  onRun,
}: {
  open: boolean;
  onClose: () => void;
  onRun: (params: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [presetId, setPresetId] = useState("wow");
  const [aStart, setAStart] = useState("");
  const [aEnd, setAEnd] = useState("");
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("preset");
    setPresetId("wow");
  }, [open]);

  function submit() {
    if (mode === "preset") {
      const preset = PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      onRun({
        date_range_start: preset.a.start,
        date_range_end: preset.a.end,
        comparison_range_start: preset.b.start,
        comparison_range_end: preset.b.end,
        label_a: preset.a.label,
        label_b: preset.b.label,
      });
      return;
    }
    if (!aStart || !aEnd || !bStart || !bEnd) return;
    onRun({
      date_range_start: aStart,
      date_range_end: aEnd,
      comparison_range_start: bStart,
      comparison_range_end: bEnd,
      label_a: `${aStart} to ${aEnd}`,
      label_b: `${bStart} to ${bEnd}`,
    });
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(480px,92vw)] rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)]"
            style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.55)" }}
          >
            <header className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--border)]">
              <div>
                <h2 className="font-serif text-[18px] font-medium tracking-tight">
                  Time-Travel Comparison
                </h2>
                <p className="text-[12px] text-[color:var(--text-tertiary)] mt-0.5">
                  Pick two periods to compare.
                </p>
              </div>
              <button
                onClick={onClose}
                className="size-8 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-secondary)]"
              >
                <X strokeWidth={1.5} className="size-4" />
              </button>
            </header>

            <div className="px-5 py-4 space-y-4">
              <div className="flex gap-1">
                <button
                  onClick={() => setMode("preset")}
                  className={`h-7 px-3 rounded-md text-[12px] tx-hover ${
                    mode === "preset"
                      ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                  }`}
                >
                  Quick preset
                </button>
                <button
                  onClick={() => setMode("custom")}
                  className={`h-7 px-3 rounded-md text-[12px] tx-hover ${
                    mode === "custom"
                      ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                  }`}
                >
                  Custom range
                </button>
              </div>

              {mode === "preset" ? (
                <div className="space-y-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPresetId(p.id)}
                      className={`w-full text-left rounded-md px-3 py-2 text-[13px] tx-hover ${
                        presetId === p.id
                          ? "bg-[color:var(--surface-elevated)] border border-[color:var(--border-strong)]"
                          : "border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] font-mono text-[color:var(--text-tertiary)]">
                    Use GA4 date keywords (e.g. <code>7daysAgo</code>, <code>30daysAgo</code>,{" "}
                    <code>today</code>, <code>yesterday</code>) or YYYY-MM-DD.
                  </p>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
                      Period A (current)
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        value={aStart}
                        onChange={(e) => setAStart(e.target.value)}
                        placeholder="7daysAgo"
                        className="flex-1 h-8 px-2.5 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[12px] font-mono"
                      />
                      <input
                        value={aEnd}
                        onChange={(e) => setAEnd(e.target.value)}
                        placeholder="today"
                        className="flex-1 h-8 px-2.5 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[12px] font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
                      Period B (comparison)
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        value={bStart}
                        onChange={(e) => setBStart(e.target.value)}
                        placeholder="14daysAgo"
                        className="flex-1 h-8 px-2.5 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[12px] font-mono"
                      />
                      <input
                        value={bEnd}
                        onChange={(e) => setBEnd(e.target.value)}
                        placeholder="7daysAgo"
                        className="flex-1 h-8 px-2.5 rounded-md bg-[color:var(--surface-elevated)] border border-[color:var(--border)] text-[12px] font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <footer className="px-5 py-3 border-t border-[color:var(--border)] flex justify-end gap-2">
              <button
                onClick={onClose}
                className="h-8 px-3 rounded-md text-[12px] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] tx-hover"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] text-[12px] font-medium hover:bg-white tx-hover"
              >
                Run brief
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

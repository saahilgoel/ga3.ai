"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, ChevronDown, Check } from "lucide-react";

export const PRESET_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 days" },
  { id: "last_28_days", label: "Last 28 days" },
  { id: "last_90_days", label: "Last 90 days" },
  { id: "month_to_date", label: "Month to date" },
  { id: "quarter_to_date", label: "Quarter to date" },
  { id: "year_to_date", label: "Year to date" },
];

export const COMPARE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "previous_period", label: "Previous period" },
  { id: "previous_year", label: "Previous year" },
  { id: "none", label: "Don't compare" },
];

export function DateRangePicker({
  preset,
  compare,
  onChange,
}: {
  preset: string;
  compare: string;
  onChange: (next: { preset: string; compare: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }
  }, [open]);

  const label =
    PRESET_OPTIONS.find((p) => p.id === preset)?.label ?? "Last 7 days";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-8 px-2.5 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] hover:bg-[color:var(--surface-hover)] tx-hover inline-flex items-center gap-1.5 text-[13px] text-[color:var(--text-primary)] font-mono"
      >
        <CalendarRange strokeWidth={1.5} className="size-3.5 text-[color:var(--text-tertiary)]" />
        <span>{label}</span>
        <ChevronDown
          strokeWidth={1.5}
          className="size-3.5 text-[color:var(--text-tertiary)]"
        />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1.5 z-30 w-[240px] rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden p-1"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
        >
          {PRESET_OPTIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onChange({ preset: p.id, compare });
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-[13px] hover:bg-[color:var(--surface-hover)] tx-hover flex items-center justify-between ${
                p.id === preset ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-secondary)]"
              }`}
            >
              <span>{p.label}</span>
              {p.id === preset && (
                <Check strokeWidth={2} className="size-3.5 text-[color:var(--text-primary)]" />
              )}
            </button>
          ))}
          <div className="h-px bg-[color:var(--border)] my-1" />
          <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
            Compare to
          </div>
          {COMPARE_OPTIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange({ preset, compare: c.id });
                setOpen(false);
              }}
              className="w-full text-left px-2.5 py-1.5 rounded-md text-[13px] hover:bg-[color:var(--surface-hover)] tx-hover flex items-center gap-2"
            >
              <span
                className={`size-3 rounded-full border ${
                  c.id === compare
                    ? "bg-[color:var(--text-primary)] border-[color:var(--text-primary)]"
                    : "border-[color:var(--border-strong)]"
                }`}
              />
              <span
                className={
                  c.id === compare
                    ? "text-[color:var(--text-primary)]"
                    : "text-[color:var(--text-secondary)]"
                }
              >
                {c.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

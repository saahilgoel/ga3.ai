"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export function ContextProgressBanner() {
  const [status, setStatus] = useState<{
    status?: string;
    current_step?: string | null;
    progress_pct?: number;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/context/status");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { status?: typeof status };
        setStatus(data.status ?? null);
      } catch {
        // soft-fail
      }
    }
    poll();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const visible =
    !dismissed &&
    status &&
    (status.status === "crawling" || status.status === "embedding");

  if (!visible) return null;
  const pct = Math.max(2, Math.min(100, status.progress_pct ?? 0));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className="border-b border-[color:var(--border)] bg-[color:var(--surface-elevated)] px-4 py-2 flex items-center gap-3"
      >
        <span className="inline-block size-1.5 rounded-full bg-[color:var(--text-primary)] animate-pulse" />
        <div className="text-[12px] flex-1 min-w-0">
          <span className="text-[color:var(--text-primary)] font-medium">
            Building customer context
          </span>
          <span className="text-[color:var(--text-tertiary)] ml-2 font-mono tabular-nums">
            {status.current_step ?? "starting"} · {pct}%
          </span>
        </div>
        <div className="w-32 h-1 rounded-full bg-[color:var(--border)] overflow-hidden hidden sm:block">
          <div
            className="h-full bg-[color:var(--text-primary)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="size-6 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)]"
          aria-label="Dismiss"
        >
          <X strokeWidth={1.5} className="size-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

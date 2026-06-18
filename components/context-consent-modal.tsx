"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, FileSearch, Users, MessagesSquare } from "lucide-react";

const KEY = "ga-chat:context-consent-asked";

type Props = {
  workspaceName?: string;
  brandHint?: string;
};

export function ContextConsentModal({ workspaceName, brandHint }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/context/status");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          status?: { status?: string } | null;
        };
        const s = data.status?.status;
        setStatus(s ?? null);
        if (s && s !== "pending") return; // already answered

        const localFlag =
          typeof window !== "undefined"
            ? window.localStorage.getItem(KEY)
            : null;
        if (!localFlag) {
          setOpen(true);
        }
      } catch {
        // soft-fail
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function build() {
    setSubmitting(true);
    try {
      await fetch("/api/context/build", { method: "POST" });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, "1");
      }
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function decline() {
    setSubmitting(true);
    try {
      await fetch("/api/context/decline", { method: "POST" });
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KEY, "1");
      }
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  void status;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(540px,92vw)] rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)]"
            style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.55)" }}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 size-8 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)]"
              aria-label="Close"
            >
              <X strokeWidth={1.5} className="size-4" />
            </button>
            <div className="px-6 pt-7 pb-5">
              <h2 className="font-mono text-[22px] font-medium tracking-tight leading-tight">
                Make the agents smarter about your business?
              </h2>
              <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 leading-relaxed">
                We can build a context profile of{" "}
                <span className="text-[color:var(--text-primary)] font-medium">
                  {brandHint || workspaceName || "this workspace"}
                </span>{" "}
                by reading the public business footprint — so when a number moves, the
                agents can explain <em>why</em>.
              </p>
            </div>
            <div className="px-6 pb-2 space-y-2.5">
              <Line icon={Globe} label="Your website (up to 50 pages)" />
              <Line
                icon={FileSearch}
                label="What Google says about you (brand SERP, news, AI overview)"
              />
              <Line
                icon={Users}
                label="Customer reviews (Trustpilot, Google Maps, Indeed)"
              />
              <Line
                icon={MessagesSquare}
                label="Public social presence (LinkedIn, X mentions, search trends)"
              />
            </div>
            <div className="px-6 pt-3 pb-1">
              <p className="text-[12px] text-[color:var(--text-tertiary)] leading-relaxed">
                All from public sources. Nothing private. You can delete it anytime in
                workspace settings. Takes ~2 minutes and uses approximately ₹15 of
                ScrapingDog credits.
              </p>
            </div>
            <div className="px-6 pt-4 pb-5 flex gap-2">
              <button
                onClick={decline}
                disabled={submitting}
                className="flex-1 h-9 rounded-md border border-[color:var(--border)] text-[13px] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] tx-hover"
              >
                Not now
              </button>
              <button
                onClick={build}
                disabled={submitting}
                className="flex-1 h-9 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] text-[13px] font-medium hover:bg-white tx-hover disabled:opacity-50"
              >
                {submitting ? "Starting…" : "Build context"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Line({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <div className="flex items-start gap-2.5 text-[13px]">
      <Icon
        strokeWidth={1.5}
        className="size-4 mt-0.5 shrink-0 text-[color:var(--text-tertiary)]"
      />
      <span className="text-[color:var(--text-secondary)]">{label}</span>
    </div>
  );
}

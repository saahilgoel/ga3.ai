"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Sparkles } from "lucide-react";

export function PaywallModal({
  open,
  onClose,
  onActivatePro,
}: {
  open: boolean;
  onClose: () => void;
  onActivatePro?: () => void;
}) {
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
            className="fixed inset-0 z-50 bg-black/65"
          />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(440px,92vw)] rounded-xl bg-[color:var(--surface)] border border-[color:var(--border)]"
            style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.55)" }}
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 size-8 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)]"
            >
              <X strokeWidth={1.5} className="size-4" />
            </button>

            <div className="px-6 pt-7 pb-5 text-center">
              <div className="size-10 mx-auto rounded-full bg-[color:var(--surface-elevated)] flex items-center justify-center mb-3 border border-[color:var(--border-strong)]">
                <Sparkles strokeWidth={1.5} className="size-4 text-[color:var(--text-primary)]" />
              </div>
              <h2 className="font-serif text-[22px] font-medium tracking-tight leading-tight">
                Briefs are part of ga-chat Pro.
              </h2>
              <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 leading-relaxed">
                Chat with your data: free forever.
                <br />
                <span className="text-[color:var(--text-primary)] font-medium">
                  Briefs: ₹2,400 / month, unlimited.
                </span>
              </p>
            </div>

            <div className="px-6 pb-2 space-y-2">
              {[
                "Daily Briefing — the 10-card morning roundup",
                "Autonomous agent scans every 4 hours",
                "Slack delivery for high-severity findings",
                "Up to 5 workspaces",
              ].map((line) => (
                <div key={line} className="flex items-start gap-2.5 text-[13px]">
                  <Check
                    strokeWidth={2}
                    className="size-3.5 mt-0.5 shrink-0 text-[color:var(--text-secondary)]"
                  />
                  <span className="text-[color:var(--text-secondary)]">{line}</span>
                </div>
              ))}
            </div>

            <div className="px-6 pt-4 pb-5 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 h-9 rounded-md border border-[color:var(--border)] text-[13px] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] tx-hover"
              >
                Maybe later
              </button>
              <button
                onClick={() => {
                  onActivatePro?.();
                  onClose();
                }}
                className="flex-1 h-9 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] text-[13px] font-medium hover:bg-white tx-hover"
              >
                Try Pro free for 14 days
              </button>
            </div>
            <div className="text-center pb-5 text-[10px] font-mono tabular-nums text-[color:var(--text-tertiary)]">
              payments not wired yet — Pro is unlocked locally for testing
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

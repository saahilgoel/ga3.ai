"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Layers } from "lucide-react";

const KEY = "ga-chat:workspaces-onboarding-seen";
const SHOW_FOR_MS = 8000;

export function OnboardingToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(KEY) === "1") return;
    } catch {
      return;
    }
    const showTimer = setTimeout(() => {
      setVisible(true);
      try {
        window.localStorage.setItem(KEY, "1");
      } catch {
        // soft-fail
      }
    }, 1200);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = setTimeout(() => setVisible(false), SHOW_FOR_MS);
    return () => clearTimeout(hideTimer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-40 max-w-[520px] w-[calc(100%-32px)] rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] px-4 py-3 flex items-start gap-3"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
        >
          <Layers
            strokeWidth={1.5}
            className="size-4 mt-0.5 shrink-0 text-[color:var(--text-secondary)]"
          />
          <div className="flex-1 text-[13px] leading-relaxed text-[color:var(--text-primary)]">
            ga-chat works on one GA4 property at a time. Switch between your
            properties anytime from the{" "}
            <span className="font-medium">property switcher</span> in the top bar.
          </div>
          <button
            onClick={() => setVisible(false)}
            className="size-6 rounded-md hover:bg-[color:var(--surface-hover)] flex items-center justify-center text-[color:var(--text-tertiary)]"
            aria-label="Dismiss"
          >
            <X strokeWidth={1.5} className="size-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Lives in the app shell (persists across navigation). The workspace switcher
// fires a `ga-chat:workspace-switched` window event on switch; we surface a
// brief "now on <property> — refreshing & onboarding" ping so the change is
// never silent. The dashboard refetch + ProgressStrip do the actual work.
export function SwitchToast() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    function onSwitch(e: Event) {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      setName(detail?.name || "this property");
    }
    window.addEventListener("ga-chat:workspace-switched", onSwitch as EventListener);
    return () =>
      window.removeEventListener("ga-chat:workspace-switched", onSwitch as EventListener);
  }, []);

  useEffect(() => {
    if (!name) return;
    const t = setTimeout(() => setName(null), 4500);
    return () => clearTimeout(t);
  }, [name]);

  return (
    <AnimatePresence>
      {name && (
        <motion.div
          key={name}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-[520px] w-[calc(100%-32px)] rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)] px-4 py-3 flex items-center gap-3"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
        >
          <span
            aria-hidden
            className="inline-block size-2 rounded-full neon-pulse shrink-0"
            style={{ background: "#7c6bff", boxShadow: "0 0 8px #7c6bff" }}
          />
          <div className="flex-1 text-[13px] leading-snug text-[color:var(--text-primary)]">
            Now on <span className="font-medium">{name}</span> — refreshing the
            dashboard and onboarding this property.
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

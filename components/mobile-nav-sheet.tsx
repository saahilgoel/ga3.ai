"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/sidebar";

export function MobileNavSheet({
  open,
  onClose,
  activeAgentId,
}: {
  open: boolean;
  onClose: () => void;
  activeAgentId?: string | null;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: [0.2, 0, 0, 1] }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <motion.aside
            key="sheet"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="fixed inset-y-0 left-0 z-50 lg:hidden"
            style={{ width: 280 }}
          >
            <Sidebar
              activeAgentId={activeAgentId}
              isMobile
              onMobileClose={onClose}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

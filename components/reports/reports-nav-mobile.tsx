"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { ReportsNav } from "./reports-nav";

// Mobile access to the reports section rail (the desktop rail is hidden < md).
// A top bar button opens a left drawer holding the full ReportsNav.
export function ReportsNavMobile() {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full h-11 px-4 border-b border-[color:var(--border)] text-[13px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover"
      >
        <Menu strokeWidth={1.5} className="size-4" />
        <span className="font-mono text-[12px] uppercase tracking-[0.08em]">Report sections</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[82vw] max-w-[280px] bg-[color:var(--surface)] border-r border-[color:var(--border)] flex flex-col">
            <div className="flex items-center justify-between px-3 h-12 border-b border-[color:var(--border)] shrink-0">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-tertiary)]">
                Reports
              </span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="size-9 grid place-items-center rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] tx-hover"
              >
                <X strokeWidth={1.5} className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ReportsNav onSelect={() => setOpen(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

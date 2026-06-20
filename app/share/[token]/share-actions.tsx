"use client";

import { Download } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[color:var(--border-strong)] text-[12px] font-mono text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] tx-hover"
    >
      <Download strokeWidth={1.5} className="size-3.5" />
      Download PDF
    </button>
  );
}

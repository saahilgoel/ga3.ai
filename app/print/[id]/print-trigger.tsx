"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, Download } from "lucide-react";

// Opens the browser's print dialog shortly after mount, once Recharts/fonts have
// settled, so the "Download PDF" action lands the user straight on the dialog.
export function PrintToolbar({ chatId }: { chatId: number }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const t = setTimeout(() => window.print(), 550);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="no-print sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--bg)]/95 backdrop-blur">
      <div className="mx-auto w-full max-w-[760px] px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <a
          href={`/chat/${chatId}`}
          className="inline-flex items-center gap-1.5 text-[12px] font-mono text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover"
        >
          <ArrowLeft strokeWidth={1.5} className="size-3.5" />
          Back to chat
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[color:var(--neon)] text-white text-[12px] font-mono font-medium hover:opacity-90 tx-hover"
        >
          <Download strokeWidth={1.5} className="size-3.5" />
          Save as PDF
        </button>
      </div>
    </div>
  );
}

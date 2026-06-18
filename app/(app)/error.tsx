"use client";

import { useEffect } from "react";
import Link from "next/link";

// Route-level error boundary for the whole authenticated app. Catches any
// client render error (e.g. a bad chart) so the user gets a recover-able panel
// instead of a blank white "Application error" screen.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error]", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-20">
      <div className="max-w-md w-full text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-tertiary)] mb-3">
          Something hiccuped
        </div>
        <h1 className="font-mono text-[24px] font-medium tracking-[-0.01em] mb-2">
          This view hit a snag.
        </h1>
        <p className="text-[13px] text-[color:var(--text-secondary)] mb-6">
          The rest of the app is fine — try again, or head back to your dashboard.
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => reset()}
            className="h-9 px-4 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:opacity-90 tx-hover text-[13px] font-medium"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="h-9 px-4 inline-flex items-center rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[13px]"
          >
            Back to dashboard
          </Link>
        </div>
        {error?.digest && (
          <div className="mt-5 font-mono text-[10px] text-[color:var(--text-tertiary)]">
            ref: {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}

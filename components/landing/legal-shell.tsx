import Link from "next/link";

/** Shared chrome + prose styling for /privacy and /terms. Server component. */
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-[color:var(--bg)] text-[color:var(--text-primary)]">
      <header className="border-b border-[color:var(--border)]">
        <div className="max-w-[820px] mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="inline-flex items-baseline gap-1.5">
            <span className="font-serif text-[22px] font-semibold tracking-[-0.02em]">GA3</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] translate-y-[-1px]">
              .ai
            </span>
          </Link>
          <Link
            href="/"
            className="text-[13px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] tx-hover"
          >
            ← Home
          </Link>
        </div>
      </header>

      <article className="max-w-[820px] mx-auto px-5 sm:px-6 py-14 sm:py-20">
        <h1 className="font-serif text-[34px] sm:text-[46px] font-medium tracking-[-0.03em]">
          {title}
        </h1>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-tertiary)]">
          Last updated · {updated}
        </p>
        <div className="legal-prose mt-10 space-y-9">{children}</div>
      </article>

      <footer className="border-t border-[color:var(--border)]">
        <div className="max-w-[820px] mx-auto px-5 sm:px-6 py-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[color:var(--text-secondary)]">
          <Link href="/privacy" className="hover:text-[color:var(--text-primary)] tx-hover">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[color:var(--text-primary)] tx-hover">
            Terms
          </Link>
          <span className="ml-auto font-mono text-[11px] text-[color:var(--text-muted)]">
            © 2026 ga3.ai
          </span>
        </div>
      </footer>
    </main>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-serif text-[20px] sm:text-[22px] font-medium tracking-[-0.01em]">
        {heading}
      </h2>
      <div className="mt-3 space-y-3 text-[14px] sm:text-[15px] leading-relaxed text-[color:var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

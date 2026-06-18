"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Property = {
  ga4_property_id: string;
  display_name: string;
  account_name: string;
  user_id: number;
  db_id: number;
};

type Group = {
  account_email: string;
  user_id: number;
  properties: Property[];
};

// One GA account (Google's own grouping) and its properties.
type Account = {
  account_name: string;
  properties: Property[];
};

export default function PropertiesPage() {
  const router = useRouter();
  const [grouped, setGrouped] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/properties")
      .then(async (r) => {
        if (r.status === 401) {
          router.push("/");
          return null;
        }
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setGrouped(data.grouped);
        if (typeof data.active_property_id === "number") {
          setSelected(data.active_property_id);
        }
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  const totalCount = useMemo(
    () => grouped?.reduce((n, g) => n + g.properties.length, 0) ?? 0,
    [grouped]
  );

  const multipleLogins = (grouped?.length ?? 0) > 1;

  // Filter by search, then nest properties under their GA account exactly the
  // way Google's own property selector does: Account → Property.
  const loginSections = useMemo(() => {
    if (!grouped) return [];
    const q = query.trim().toLowerCase();
    return grouped
      .map((g) => {
        const matches = g.properties.filter((p) => {
          if (!q) return true;
          return (
            p.display_name.toLowerCase().includes(q) ||
            p.account_name.toLowerCase().includes(q) ||
            p.ga4_property_id.toLowerCase().includes(q)
          );
        });
        // Group the matching properties by GA account name.
        const byAccount = new Map<string, Property[]>();
        for (const p of matches) {
          const key = p.account_name || "Account";
          const arr = byAccount.get(key) ?? [];
          arr.push(p);
          byAccount.set(key, arr);
        }
        const accounts: Account[] = Array.from(byAccount.entries())
          .map(([account_name, properties]) => ({ account_name, properties }))
          .sort((a, b) => a.account_name.localeCompare(b.account_name));
        return { ...g, accounts, matchCount: matches.length };
      })
      .filter((g) => g.matchCount > 0);
  }, [grouped, query]);

  const matchCount = useMemo(
    () => loginSections.reduce((n, g) => n + g.matchCount, 0),
    [loginSections]
  );

  async function activate() {
    if (selected == null) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/properties/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ property_ids: [selected] }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || `HTTP ${res.status}`);
      setSubmitting(false);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[color:var(--bg)]">
      {/* Top accent line that hints at the neon strip from the dashboard */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#7c6bff]/40 to-transparent" />

      {/* Header: brand + a way out of the flow (this page has no app chrome) */}
      <header className="max-w-2xl mx-auto px-6 pt-6 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-dark.svg" alt="GA3" width={22} height={22} />
          <span className="font-mono text-[14px] font-semibold tracking-[0.04em]">
            GA3<span className="text-[color:var(--text-tertiary)]">.ai</span>
          </span>
        </Link>
        <a
          href="/api/auth/logout"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[color:var(--border)] text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)] tx-hover"
        >
          Log out
        </a>
      </header>

      <div className="max-w-2xl mx-auto px-6 pt-8 pb-32">
        <div className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)] mb-2">
            STEP 1 · CHOOSE A PROPERTY
          </div>
          <h1 className="font-serif text-[34px] leading-[1.05] font-medium tracking-[-0.02em]">
            Which GA4 property should I analyze?
          </h1>
          <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 max-w-xl">
            Pick the Google Analytics property for the site you want to work on.
            You can switch to a different one anytime from the top bar.
          </p>
        </div>

        {/* Search + add-account */}
        <div className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-[color:var(--bg)]/85 backdrop-blur-md border-b border-[color:var(--border)]/60">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[color:var(--text-tertiary)] pointer-events-none"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.6" y2="16.6" />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${totalCount} properties · name, account, ID…`}
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-[color:var(--surface)] border border-[color:var(--border)] focus:border-[color:var(--accent)] focus:outline-none text-base sm:text-[13px] placeholder:text-[color:var(--text-tertiary)] transition-colors"
                autoFocus
                autoCorrect="off"
                autoCapitalize="none"
              />
            </div>
            <Link
              href="/api/auth/login?add=1"
              className="hidden md:inline-flex h-10 px-3 items-center rounded-lg border border-[color:var(--border)] text-[12px] text-[color:var(--text-secondary)] hover:border-[color:var(--accent)]/60 hover:text-[color:var(--text-primary)] tx-hover whitespace-nowrap"
            >
              + Add Google account
            </Link>
          </div>
          {query && (
            <div className="mt-2 text-[11px] font-mono text-[color:var(--text-tertiary)]">
              {matchCount} match{matchCount === 1 ? "" : "es"}
            </div>
          )}
        </div>

        {error && (
          <div
            className="mt-6 rounded-md px-3 py-2 text-[12px] flex items-center gap-2"
            style={{
              background: "rgba(208, 72, 72, 0.08)",
              border: "1px solid rgba(208, 72, 72, 0.2)",
              color: "var(--severity-high)",
            }}
          >
            <span>{error}</span>
          </div>
        )}

        {!grouped && !error && (
          <div className="mt-12 space-y-2 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-[color:var(--surface)] border border-[color:var(--border)]"
                style={{ opacity: 1 - i * 0.12 }}
              />
            ))}
          </div>
        )}

        {grouped && grouped.length === 0 && (
          <div className="mt-16 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
            <div className="text-[15px] font-medium mb-1">No GA4 properties found</div>
            <div className="text-[12px] text-[color:var(--text-secondary)]">
              Make sure this Google account has at least one GA4 property and the
              analytics read-only scope was granted.
            </div>
          </div>
        )}

        {/* Account → Property, mirroring Google's own selector */}
        <div className="mt-6 space-y-6">
          {loginSections.map((login) => (
            <section key={login.user_id}>
              {multipleLogins && (
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[color:var(--text-tertiary)] truncate mb-3 px-1">
                  {login.account_email}
                </div>
              )}
              <div className="space-y-5">
                {login.accounts.map((acct) => (
                  <div key={`${login.user_id}:${acct.account_name}`}>
                    <header className="flex items-center gap-2 mb-2 px-1">
                      <svg
                        viewBox="0 0 24 24"
                        className="size-3.5 text-[color:var(--text-tertiary)] shrink-0"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                      >
                        <path d="M3 7h18M3 12h18M3 17h18" />
                      </svg>
                      <div className="text-[12px] font-medium text-[color:var(--text-secondary)] truncate">
                        {acct.account_name}
                      </div>
                      <div className="text-[11px] font-mono text-[color:var(--text-tertiary)] shrink-0">
                        {acct.properties.length}
                      </div>
                    </header>
                    <div className="space-y-1.5">
                      {acct.properties.map((p) => {
                        const isSel = selected === p.db_id;
                        return (
                          <button
                            key={p.db_id}
                            onClick={() => setSelected(p.db_id)}
                            aria-pressed={isSel}
                            className="w-full text-left rounded-lg border px-4 py-3 transition-all duration-150"
                            style={
                              isSel
                                ? {
                                    borderColor: "#7c6bff",
                                    background: "var(--surface)",
                                    boxShadow:
                                      "0 0 0 1px rgba(124,107,255,0.35), 0 0 18px -2px rgba(124,107,255,0.4)",
                                  }
                                : {
                                    borderColor: "var(--border)",
                                    background: "var(--surface)",
                                  }
                            }
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="size-5 rounded-full border flex items-center justify-center shrink-0"
                                style={
                                  isSel
                                    ? {
                                        borderColor: "#7c6bff",
                                        background: "#7c6bff",
                                        boxShadow: "0 0 8px rgba(124,107,255,0.55)",
                                        color: "var(--accent-foreground)",
                                      }
                                    : { borderColor: "var(--border)" }
                                }
                              >
                                {isSel && (
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate flex items-baseline gap-2">
                                  <span className="truncate">{p.display_name}</span>
                                  <span className="text-[11px] text-[color:var(--text-tertiary)] font-mono shrink-0">
                                    #{p.ga4_property_id}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {grouped && grouped.length > 0 && matchCount === 0 && query.trim() && (
          <div className="mt-10 text-center text-[13px] text-[color:var(--text-tertiary)]">
            No properties match <span className="font-mono">&ldquo;{query}&rdquo;</span>.
          </div>
        )}

        {/* Mobile add-account (search row hides it on small screens) */}
        <div className="md:hidden mt-6">
          <Link
            href="/api/auth/login?add=1"
            className="inline-flex h-10 px-3 items-center rounded-lg border border-[color:var(--border)] text-[12px] text-[color:var(--text-secondary)]"
          >
            + Add Google account
          </Link>
        </div>
      </div>

      {/* Sticky bottom action bar */}
      {grouped && grouped.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-20 px-6 py-3 bg-gradient-to-t from-[color:var(--bg)] via-[color:var(--bg)]/95 to-transparent pb-safe">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="text-[12px] text-[color:var(--text-secondary)] hidden sm:block">
              {selected == null
                ? "Pick a property to continue"
                : "Ready — I'll start reading this property"}
            </div>
            <Button
              onClick={activate}
              disabled={submitting || selected == null}
              size="lg"
              className={
                selected != null
                  ? "shadow-[0_0_24px_-4px_var(--accent)] transition-shadow"
                  : ""
              }
            >
              {submitting ? "Preparing…" : "Continue"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

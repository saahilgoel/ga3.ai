"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  UsageSummary,
  ProviderRow,
  SectionRow,
  AccountRow,
} from "@/lib/usage/query";

const USD_TO_INR = Number(process.env.NEXT_PUBLIC_USD_TO_INR || 83);

function usd(n: number): string {
  return `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function inr(n: number): string {
  return `₹${Math.round((n || 0) * USD_TO_INR).toLocaleString("en-IN")}`;
}
function num(n: number): string {
  const v = n || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return `${v}`;
}

const RANGES: Array<{ label: string; days: number }> = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "All time", days: 0 },
];

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic (LLM tokens)",
  scrapingdog: "ScrapingDog (credits)",
  voyage: "Voyage (embeddings)",
};

export function AdminClient() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/usage?days=${days}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Not authorized" : `HTTP ${r.status}`);
        return r.json();
      })
      .then((d: UsageSummary) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <main className="min-h-dvh bg-[color:var(--bg)] text-[color:var(--text-primary)]">
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-tertiary)]">
            Admin · Usage &amp; Cost
          </div>
          <Link
            href="/dashboard"
            className="text-[12px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          >
            ← Back to app
          </Link>
        </div>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.02em] mb-4">
          Usage &amp; Cost
        </h1>

        {/* Range tabs */}
        <div className="inline-flex rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-0.5 mb-6">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 h-8 rounded-md text-[12px] tx-hover ${
                days === r.days
                  ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
                  : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-[13px] text-[color:var(--severity-high)]">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg bg-[color:var(--surface)] border border-[color:var(--border)]" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Total */}
            <section className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 mb-6">
              <div className="text-[11px] font-mono uppercase tracking-[0.1em] text-[color:var(--text-tertiary)] mb-1">
                Total estimated cost
              </div>
              <div className="flex items-baseline gap-3">
                <div className="font-serif text-[40px] font-medium tabular-nums leading-none">
                  {inr(data.total.cost_usd)}
                </div>
                <div className="text-[14px] text-[color:var(--text-secondary)] tabular-nums">
                  {usd(data.total.cost_usd)}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
                <span>{num(data.total.input_tokens + data.total.output_tokens)} LLM tokens</span>
                <span>{num(data.total.credits)} scraping credits</span>
                <span>{num(data.total.events)} events</span>
              </div>
            </section>

            {/* By provider */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
              {data.byProvider.map((p) => (
                <ProviderCard key={p.provider} p={p} />
              ))}
              {data.byProvider.length === 0 && (
                <div className="text-[13px] text-[color:var(--text-tertiary)] col-span-3">
                  No usage recorded in this range yet.
                </div>
              )}
            </div>

            {/* By section */}
            <SectionTable rows={data.bySection} />

            {/* By account */}
            <AccountTable rows={data.byAccount} />
          </>
        )}
      </div>
    </main>
  );
}

function ProviderCard({ p }: { p: ProviderRow }) {
  const detail =
    p.provider === "scrapingdog"
      ? `${num(p.credits)} credits`
      : `${num(p.input_tokens + p.output_tokens)} tokens`;
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] mb-2 truncate">
        {PROVIDER_LABEL[p.provider] ?? p.provider}
      </div>
      <div className="font-medium text-[22px] tabular-nums">{inr(p.cost_usd)}</div>
      <div className="text-[12px] text-[color:var(--text-secondary)] tabular-nums mt-0.5">
        {usd(p.cost_usd)} · {detail}
      </div>
    </div>
  );
}

function SectionTable({ rows }: { rows: SectionRow[] }) {
  return (
    <section className="mb-8">
      <h2 className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)] font-medium mb-2">
        By section
      </h2>
      <div className="rounded-lg border border-[color:var(--border)] overflow-hidden text-[13px]">
        <div className="flex bg-[color:var(--surface-elevated)] border-b border-[color:var(--border)] text-[color:var(--text-secondary)] font-medium">
          <div className="flex-1 px-3 py-2">Section</div>
          <div className="w-[120px] px-3 py-2 text-right">Cost (₹)</div>
          <div className="w-[110px] px-3 py-2 text-right">Tokens</div>
          <div className="w-[110px] px-3 py-2 text-right">Credits</div>
        </div>
        {rows.map((r) => (
          <div key={r.section} className="flex border-b border-[color:var(--border)] last:border-b-0">
            <div className="flex-1 px-3 py-2 font-mono">{r.section}</div>
            <div className="w-[120px] px-3 py-2 text-right tabular-nums">{inr(r.cost_usd)}</div>
            <div className="w-[110px] px-3 py-2 text-right tabular-nums text-[color:var(--text-secondary)]">
              {num(r.input_tokens + r.output_tokens)}
            </div>
            <div className="w-[110px] px-3 py-2 text-right tabular-nums text-[color:var(--text-secondary)]">
              {num(r.credits)}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-3 py-4 text-[color:var(--text-tertiary)]">No data.</div>
        )}
      </div>
    </section>
  );
}

function AccountTable({ rows }: { rows: AccountRow[] }) {
  return (
    <section className="mb-12">
      <h2 className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-secondary)] font-medium mb-2">
        By account
      </h2>
      <div className="rounded-lg border border-[color:var(--border)] overflow-hidden text-[13px]">
        <div className="flex bg-[color:var(--surface-elevated)] border-b border-[color:var(--border)] text-[color:var(--text-secondary)] font-medium">
          <div className="flex-1 px-3 py-2">Account</div>
          <div className="w-[110px] px-3 py-2 text-right">Total (₹)</div>
          <div className="w-[100px] px-3 py-2 text-right">Anthropic</div>
          <div className="w-[100px] px-3 py-2 text-right">ScrapingDog</div>
          <div className="w-[90px] px-3 py-2 text-right">Voyage</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.user_id ?? "unattributed"}
            className="flex border-b border-[color:var(--border)] last:border-b-0"
          >
            <div className="flex-1 px-3 py-2 truncate">
              {r.email || (
                <span className="text-[color:var(--text-tertiary)] italic">unattributed</span>
              )}
            </div>
            <div className="w-[110px] px-3 py-2 text-right tabular-nums font-medium">{inr(r.cost_usd)}</div>
            <div className="w-[100px] px-3 py-2 text-right tabular-nums text-[color:var(--text-secondary)]">{inr(r.anthropic_cost)}</div>
            <div className="w-[100px] px-3 py-2 text-right tabular-nums text-[color:var(--text-secondary)]">{inr(r.scrapingdog_cost)}</div>
            <div className="w-[90px] px-3 py-2 text-right tabular-nums text-[color:var(--text-secondary)]">{inr(r.voyage_cost)}</div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="px-3 py-4 text-[color:var(--text-tertiary)]">No data.</div>
        )}
      </div>
    </section>
  );
}

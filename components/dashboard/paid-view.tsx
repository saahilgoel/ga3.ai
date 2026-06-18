"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plug, AlertTriangle, ArrowUpRight } from "lucide-react";

type PaidResponse =
  | { configured: false; hint: string }
  | { configured: true; attached: false }
  | {
      configured: true;
      attached: true;
      totals: {
        spend: number;
        clicks: number;
        impressions: number;
        conversions: number;
        avg_cpc: number;
      };
      top_campaigns: Array<{
        campaign: string;
        spend: number;
        clicks: number;
        conversions: number;
      }>;
      ads_customers: Array<{ id: string; name: string }>;
      error?: string;
    };

export function PaidView({
  rangePreset,
  onInvestigate,
}: {
  rangePreset: string;
  onInvestigate: (prompt: string, agent: string) => void;
}) {
  const [data, setData] = useState<PaidResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/dashboard/paid", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ range_preset: rangePreset }),
        });
        if (!res.ok || cancelled) return;
        setData(await res.json());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangePreset]);

  if (loading || !data) {
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 animate-pulse">
        <div className="h-3 w-32 rounded bg-[color:var(--surface-elevated)]" />
        <div className="h-8 w-48 mt-3 rounded bg-[color:var(--surface-elevated)]" />
      </div>
    );
  }

  if (!data.configured) {
    return (
      <EmptyState
        title="Connect Google Ads"
        body="Walk through a 3-step setup to unlock spend, clicks, conversions, and top campaigns in real time. About 1 minute if you already have a Google Ads Manager (MCC) account."
        ctaLabel="Start setup"
        ctaHref="/connect/google-ads?back=/dashboard"
      />
    );
  }
  if (!data.attached) {
    return (
      <EmptyState
        title="Pick a Google Ads account"
        body="You've granted access — now choose which Ads customers to attach to this workspace."
        ctaLabel="Pick accounts"
        ctaHref="/connect/google-ads?back=/dashboard"
      />
    );
  }
  if (data.error) {
    return (
      <div
        className="rounded-md px-3 py-2 text-[12px] flex items-center gap-2"
        style={{
          background: "rgba(208, 72, 72, 0.08)",
          border: "1px solid rgba(208, 72, 72, 0.2)",
          color: "var(--severity-high)",
        }}
      >
        <AlertTriangle strokeWidth={1.5} className="size-4" />
        <span>{data.error}</span>
      </div>
    );
  }

  const t = data.totals;
  const max = Math.max(1, ...data.top_campaigns.map((c) => c.spend));
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <PaidKpi label="Spend" value={`₹${compact(t.spend)}`} onClick={() => onInvestigate(`Why did spend trend the way it did over ${rangePreset.replace(/_/g, " ")}? Total ₹${compact(t.spend)} on ${compact(t.clicks)} clicks.`, "vera")} />
        <PaidKpi label="Clicks" value={compact(t.clicks)} onClick={() => onInvestigate(`Click volume for ${rangePreset.replace(/_/g, " ")}: ${compact(t.clicks)}. Which campaigns drove the most?`, "vera")} />
        <PaidKpi label="Conversions (Ads)" value={compact(t.conversions)} onClick={() => onInvestigate(`Ads-reported ${compact(t.conversions)} conversions. Compare to GA4 reality.`, "vera")} />
        <PaidKpi label="Avg CPC" value={`₹${t.avg_cpc.toFixed(2)}`} onClick={() => onInvestigate(`Avg CPC ₹${t.avg_cpc.toFixed(2)}. Which keywords are pulling the average up?`, "vera")} />
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
        <header className="px-5 py-3 border-b border-[color:var(--border)] flex items-center justify-between">
          <span className="font-serif text-[15px] font-medium">Top campaigns by spend</span>
          <span className="text-[11px] font-mono text-[color:var(--text-tertiary)]">
            {data.ads_customers.map((c) => c.name).join(" · ")}
          </span>
        </header>
        <ul className="divide-y divide-[color:var(--border)]">
          {data.top_campaigns.length === 0 ? (
            <li className="px-5 py-6 text-center text-[12px] text-[color:var(--text-tertiary)]">
              No campaigns in this window.
            </li>
          ) : (
            data.top_campaigns.map((c, i) => (
              <li key={i}>
                <button
                  onClick={() =>
                    onInvestigate(
                      `Audit campaign "${c.campaign}" — spend ₹${compact(c.spend)}, ${c.clicks} clicks, ${c.conversions} ads-reported conv. Is this efficient?`,
                      "vera"
                    )
                  }
                  className="w-full px-5 py-3 hover:bg-[color:var(--surface-hover)] tx-hover group text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] truncate flex-1 text-[color:var(--text-primary)]">
                      {c.campaign}
                    </span>
                    <span className="font-mono tabular-nums text-[12px] text-[color:var(--text-secondary)] shrink-0">
                      ₹{compact(c.spend)}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-[color:var(--text-tertiary)] shrink-0 w-16 text-right">
                      {compact(c.clicks)} clicks
                    </span>
                    <ArrowUpRight
                      strokeWidth={1.5}
                      className="size-3.5 text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100 tx-hover"
                    />
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-[color:var(--border)] overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${(c.spend / max) * 100}%`,
                        background: "var(--accent, var(--text-primary))",
                        opacity: 0.3,
                      }}
                    />
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );
}

function PaidKpi({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)]">
          {label}
        </span>
        <ArrowUpRight
          strokeWidth={1.5}
          className="size-3 text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100 tx-hover"
        />
      </div>
      <div className="font-mono text-[26px] tabular-nums font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </button>
  );
}

function EmptyState({
  title,
  body,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
      <div className="font-serif text-[18px] font-medium">{title}</div>
      <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 max-w-[480px] mx-auto leading-relaxed">
        {body}
      </p>
      <Link
        href={ctaHref}
        className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium"
      >
        <Plug strokeWidth={1.5} className="size-3.5" />
        {ctaLabel}
      </Link>
    </div>
  );
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} cr`;
  if (Math.abs(n) >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-IN");
}

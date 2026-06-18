"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Plug, AlertTriangle } from "lucide-react";

type UnifiedResponse =
  | { configured: false }
  | { configured: true; attached: false }
  | { configured: true; attached: true; no_ga4?: true }
  | {
      configured: true;
      attached: true;
      totals: {
        total_spend: number;
        ads_conversions: number;
        ga4_conversions: number;
        ga4_revenue: number;
        blended_roas: number;
        real_cac: number | null;
      };
      campaigns: Array<{
        campaign: string;
        spend: number;
        ads_conversions: number;
        ga4_conversions: number;
        attribution_gap_pct: number;
        sessions: number;
        ga4_revenue: number;
        real_cac: number | null;
        blended_roas: number | null;
      }>;
      error?: string;
    };

export function UnifiedView({
  rangePreset,
  onInvestigate,
}: {
  rangePreset: string;
  onInvestigate: (prompt: string, agent: string) => void;
}) {
  const [data, setData] = useState<UnifiedResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/dashboard/unified", {
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
      </div>
    );
  }

  if (!data.configured || !data.attached || "no_ga4" in data) {
    const needAds = !data.configured || !data.attached;
    return (
      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 text-center">
        <div className="font-mono text-[18px] font-medium">Unified view needs both</div>
        <p className="text-[13px] text-[color:var(--text-secondary)] mt-2 max-w-[480px] mx-auto leading-relaxed">
          Connect both a GA4 property and a Google Ads customer to this workspace to see blended ROAS,
          Real CAC, and per-campaign attribution gaps.
        </p>
        <Link
          href={needAds ? "/connect/google-ads?back=/dashboard" : "/workspace"}
          className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium"
        >
          <Plug strokeWidth={1.5} className="size-3.5" />
          {needAds ? "Connect Google Ads" : "Open Workspace"}
        </Link>
      </div>
    );
  }

  if ("error" in data && data.error) {
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

  // Type guard: at this point data has totals + campaigns
  if (!("totals" in data)) return null;
  const t = data.totals;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <UnifiedKpi
          label="Marketing spend"
          value={`₹${compact(t.total_spend)}`}
          onClick={() =>
            onInvestigate(
              `Total marketing spend was ₹${compact(t.total_spend)}. Walk through where it went and what came back.`,
              "vera"
            )
          }
        />
        <UnifiedKpi
          label="Attributed revenue (GA4)"
          value={`₹${compact(t.ga4_revenue)}`}
          onClick={() =>
            onInvestigate(`GA4-attributed revenue was ₹${compact(t.ga4_revenue)}. Which campaigns drove it?`, "vera")
          }
        />
        <UnifiedKpi
          label="Blended ROAS"
          value={`${t.blended_roas.toFixed(2)}x`}
          onClick={() =>
            onInvestigate(
              `Blended ROAS came in at ${t.blended_roas.toFixed(2)}x. Is that the real story or are some campaigns dragging the average?`,
              "vera"
            )
          }
        />
        <UnifiedKpi
          label="Real CAC"
          value={t.real_cac == null ? "—" : `₹${t.real_cac.toFixed(0)}`}
          onClick={() =>
            onInvestigate(
              `Real CAC (spend ÷ GA4-attributed conversions) is ₹${t.real_cac ?? "?"}. How does it compare across channels?`,
              "vera"
            )
          }
        />
      </div>

      <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
        <header className="px-5 py-3 border-b border-[color:var(--border)] flex items-center justify-between">
          <span className="font-mono text-[15px] font-medium">
            Spend vs conversions per campaign
          </span>
          <span className="text-[11px] font-mono text-[color:var(--text-tertiary)]">
            Ads reported {compact(t.ads_conversions)} · GA4 attributed {compact(t.ga4_conversions)}
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[color:var(--surface-elevated)]">
              <tr>
                <Th>Campaign</Th>
                <Th>Spend</Th>
                <Th>Ads conv</Th>
                <Th>GA4 conv</Th>
                <Th>Gap %</Th>
                <Th>Real CAC</Th>
                <Th>ROAS</Th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-[12px] text-[color:var(--text-tertiary)]"
                  >
                    No matching campaigns in this window.
                  </td>
                </tr>
              ) : (
                data.campaigns.map((c, i) => (
                  <tr
                    key={i}
                    onClick={() =>
                      onInvestigate(
                        `Audit "${c.campaign}" — ₹${compact(c.spend)} spent. Ads says ${c.ads_conversions} conv, GA4 says ${c.ga4_conversions} (${c.attribution_gap_pct}% gap). What's happening?`,
                        "vera"
                      )
                    }
                    className="border-b border-[color:var(--border)] last:border-b-0 hover:bg-[color:var(--surface-hover)] cursor-pointer"
                  >
                    <Td>{c.campaign}</Td>
                    <Td mono>₹{compact(c.spend)}</Td>
                    <Td mono>{compact(c.ads_conversions)}</Td>
                    <Td mono>{compact(c.ga4_conversions)}</Td>
                    <Td
                      mono
                      tone={Math.abs(c.attribution_gap_pct) >= 30 ? "warn" : "default"}
                    >
                      {c.attribution_gap_pct >= 0 ? "+" : ""}
                      {c.attribution_gap_pct.toFixed(1)}%
                    </Td>
                    <Td mono>{c.real_cac == null ? "—" : `₹${c.real_cac.toFixed(0)}`}</Td>
                    <Td mono>{c.blended_roas == null ? "—" : `${c.blended_roas.toFixed(2)}x`}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function UnifiedKpi({
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
      <div className="font-mono text-[24px] tabular-nums font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </button>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-3 py-2 text-[10px] font-mono uppercase tracking-[0.06em] text-[color:var(--text-tertiary)] whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({
  children,
  mono,
  tone,
}: {
  children: React.ReactNode;
  mono?: boolean;
  tone?: "default" | "warn";
}) {
  return (
    <td
      className={`px-3 py-2 ${mono ? "font-mono tabular-nums" : ""} ${
        tone === "warn" ? "text-[color:var(--severity-medium)]" : ""
      }`}
    >
      {children}
    </td>
  );
}

function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} cr`;
  if (Math.abs(n) >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-IN");
}

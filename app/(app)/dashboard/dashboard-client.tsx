"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import {
  ChartSkeleton,
  DashboardData,
  DeviceMixTile,
  KpiSkeleton,
  KpiTile,
  ListSkeleton,
  ListTile,
  RealtimeTile,
  TrafficChartTile,
} from "@/components/dashboard/tiles";
import { ViewToggle, type DashboardView } from "@/components/dashboard/view-toggle";
import { SiteFavicon } from "@/components/site-favicon";
import { PaidView } from "@/components/dashboard/paid-view";
import { UnifiedView } from "@/components/dashboard/unified-view";

type Props = {
  workspace: { id: number; name: string; property_count: number; websiteUrl?: string | null };
  initialRange: string;
  initialCompare: string;
  initialCustom: { start: string; end: string } | null;
};

export function DashboardClient({
  workspace,
  initialRange,
  initialCompare,
  initialCustom,
}: Props) {
  const router = useRouter();
  const [preset, setPreset] = useState(initialRange);
  const [compare, setCompare] = useState(initialCompare);
  const [view, setView] = useState<DashboardView>("audience");

  // Restore view preference per workspace
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        `ga-chat:dashboard-view:${workspace.id}`
      );
      if (stored === "audience" || stored === "paid" || stored === "unified") {
        setView(stored);
      }
    } catch {
      /* ignore */
    }
  }, [workspace.id]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        `ga-chat:dashboard-view:${workspace.id}`,
        view
      );
    } catch {
      /* ignore */
    }
  }, [view, workspace.id]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const inflight = useRef<AbortController | null>(null);

  // Persist comparison choice
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("ga-chat:dashboard-compare");
      if (stored && !initialCompare) setCompare(stored);
    } catch {
      /* ignore */
    }
  }, [initialCompare]);
  useEffect(() => {
    try {
      window.localStorage.setItem("ga-chat:dashboard-compare", compare);
    } catch {
      /* ignore */
    }
  }, [compare]);

  // When the active property changes, drop the previous property's data so the
  // dashboard shows skeletons (not stale numbers) until the refetch lands.
  useEffect(() => {
    setData(null);
    setNarrative("");
    setLoading(true);
  }, [workspace.id]);

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (preset !== "last_7_days") params.set("range", preset);
    if (compare !== "previous_period") params.set("compare", compare);
    if (initialCustom) {
      params.set("start", initialCustom.start);
      params.set("end", initialCustom.end);
    }
    const qs = params.toString();
    const url = `/dashboard${qs ? `?${qs}` : ""}`;
    router.replace(url, { scroll: false });
  }, [preset, compare, initialCustom, router]);

  const fetchDashboard = useCallback(
    async (refresh = false) => {
      // Pass a typed reason so the AbortError carries metadata we can recognise.
      if (inflight.current) {
        inflight.current.abort(
          typeof DOMException !== "undefined"
            ? new DOMException("superseded", "AbortError")
            : undefined
        );
      }
      const ac = new AbortController();
      inflight.current = ac;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            range_preset: preset,
            compare,
            refresh,
            range: initialCustom,
            // Tie the request to the active property so a switch re-runs this
            // effect (the server still reads the active workspace from session).
            ws: workspace.id,
          }),
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as DashboardData;
        if (ac.signal.aborted) return;
        setData(json);
        setLastFetchedAt(Date.now());
      } catch (err) {
        // Swallow any abort-related failure regardless of how it surfaces.
        if (ac.signal.aborted || (err as Error)?.name === "AbortError") return;
        console.error("[dashboard] fetch failed:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [preset, compare, initialCustom, workspace.id]
  );

  useEffect(() => {
    // Fire-and-forget; catch any rejection (including aborts on unmount) so
    // Next 15's dev overlay never sees an "unhandled" promise reject.
    fetchDashboard(false).catch(() => {});
    return () => {
      if (inflight.current) {
        inflight.current.abort(
          typeof DOMException !== "undefined"
            ? new DOMException("unmount", "AbortError")
            : undefined
        );
        inflight.current = null;
      }
    };
  }, [fetchDashboard]);

  // Generate narrative TL;DR (best-effort; rendered when ready)
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setNarrative("");
    (async () => {
      try {
        const res = await fetch("/api/dashboard/narrative", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data }),
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { narrative: string };
        if (!cancelled) setNarrative(json.narrative ?? "");
      } catch {
        /* soft-fail */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);

  function askConversation(prompt: string, agent: string) {
    const params = new URLSearchParams({ agent, ask: prompt });
    router.push(`/chat/new?${params.toString()}`);
  }

  const channelsMax = useMemo(
    () =>
      data?.top_channels?.[0]?.sessions ?? 1,
    [data]
  );
  const pagesMax = useMemo(
    () => data?.top_landing_pages?.[0]?.sessions ?? 1,
    [data]
  );
  const geoMax = useMemo(
    () => data?.top_geography?.rows?.[0]?.sessions ?? 1,
    [data]
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] py-6 lg:py-8">
            {/* Header */}
            <header className="flex items-baseline justify-between mb-2 flex-wrap gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] font-mono">
                  Dashboard
                </div>
                <div className="flex items-center gap-2.5 mt-1">
                  <SiteFavicon url={workspace.websiteUrl || workspace.name} size={28} />
                  <h1 className="font-mono text-[28px] font-medium tracking-[-0.02em] leading-[1.1]">
                    {workspace.name}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <ViewToggle view={view} onChange={setView} />
                <DateRangePicker
                  preset={preset}
                  compare={compare}
                  onChange={({ preset: p, compare: c }) => {
                    setPreset(p);
                    setCompare(c);
                  }}
                />
              </div>
            </header>

            <div className="text-[13px] text-[color:var(--text-secondary)] leading-relaxed min-h-[1.5em] mb-6">
              {view === "audience" ? (
                narrative ? (
                  <span>{narrative}</span>
                ) : data ? (
                  <span className="text-[color:var(--text-tertiary)]">
                    {compare === "none"
                      ? `Showing ${data.range.label}.`
                      : `Showing ${data.range.label} vs ${
                          compare === "previous_year" ? "previous year" : "prior period"
                        }.`}
                  </span>
                ) : null
              ) : (
                <span className="text-[color:var(--text-tertiary)]">
                  {view === "paid"
                    ? "Paid view: spend, clicks, conversions, top campaigns from Google Ads."
                    : "Unified view: blended ROAS, real CAC, attribution gap (Ads vs GA4)."}
                </span>
              )}
            </div>

            {view === "paid" && (
              <PaidView rangePreset={preset} onInvestigate={askConversation} />
            )}
            {view === "unified" && (
              <UnifiedView rangePreset={preset} onInvestigate={askConversation} />
            )}

            {view === "audience" && (
              <>
            {/* Realtime */}
            {data && data.realtime && (
              <div className="mb-4">
                <RealtimeTile
                  initial={data.realtime}
                  onInvestigate={() =>
                    askConversation(
                      "Who's on the site right now? Where are they coming from and what are they doing?",
                      "any"
                    )
                  }
                />
              </div>
            )}

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {loading || !data ? (
                <>
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                  <KpiSkeleton />
                </>
              ) : (
                <>
                  <KpiTile
                    label="Sessions"
                    kpi={data.kpi.sessions}
                    format="compact"
                    onInvestigate={() =>
                      askConversation(
                        `Walk me through the session trend for ${data.range.label}. What drove the ${
                          data.kpi.sessions.delta_pct != null
                            ? (data.kpi.sessions.delta_pct >= 0 ? "+" : "") +
                              data.kpi.sessions.delta_pct.toFixed(1) +
                              "% vs prior"
                            : "trend"
                        }?`,
                        "maya"
                      )
                    }
                  />
                  <KpiTile
                    label="Users"
                    kpi={data.kpi.users}
                    format="compact"
                    onInvestigate={() =>
                      askConversation(
                        `Break down where users came from this period (${data.range.label}). Compare to the prior period.`,
                        "maya"
                      )
                    }
                  />
                  <KpiTile
                    label="Engagement"
                    kpi={data.kpi.engagement_rate}
                    format="percent"
                    onInvestigate={() =>
                      askConversation(
                        `Engagement rate changed by ${data.kpi.engagement_rate.delta_pct ?? 0}% over ${data.range.label}. What pages or sources are driving the change?`,
                        "arjun"
                      )
                    }
                  />
                  <KpiTile
                    label="Conversions"
                    kpi={data.kpi.conversions}
                    format="compact"
                    onInvestigate={() =>
                      askConversation(
                        `Conversions over ${data.range.label}: where are they coming from, and what changed vs prior?`,
                        "maya"
                      )
                    }
                  />
                </>
              )}
            </div>

            {/* Traffic chart */}
            <div className="mb-6">
              {loading || !data ? (
                <ChartSkeleton />
              ) : (
                <TrafficChartTile
                  data={data.traffic_over_time}
                  onInvestigate={() =>
                    askConversation(
                      `Analyze the traffic pattern over ${data.range.label}. What stands out — spikes, dips, day-of-week effects?`,
                      "maya"
                    )
                  }
                />
              )}
            </div>

            {/* Lower grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
              {loading || !data ? (
                <>
                  <ListSkeleton />
                  <ListSkeleton />
                  <ListSkeleton />
                </>
              ) : (
                <>
                  <ListTile
                    title="Top channels"
                    rightColumn="share"
                    rows={data.top_channels.map((c) => ({
                      key: c.channel,
                      label: c.channel,
                      primary: fmtCompactNum(c.sessions),
                      right: `${c.share_pct.toFixed(1)}%`,
                      value: c.sessions,
                      max: channelsMax,
                    }))}
                    onInvestigateRow={(key) =>
                      askConversation(
                        `Why is ${key} doing what it's doing in ${data.range.label}? Compare to prior period.`,
                        "maya"
                      )
                    }
                  />
                  <ListTile
                    title="Top landing pages"
                    rightColumn="engagement"
                    rows={data.top_landing_pages.map((p) => ({
                      key: p.path,
                      label: p.path,
                      primary: fmtCompactNum(p.sessions),
                      right: `${(p.engagement_rate * 100).toFixed(0)}%`,
                      value: p.sessions,
                      max: pagesMax,
                    }))}
                    onInvestigateRow={(key) =>
                      askConversation(
                        `Audit ${key} as a landing page. What's the engagement and conversion story?`,
                        "arjun"
                      )
                    }
                  />
                  <ListTile
                    title={`Top ${data.top_geography.granularity === "city" ? "cities" : "countries"}`}
                    rows={data.top_geography.rows.map((r) => ({
                      key: r.name,
                      label: r.name,
                      primary: fmtCompactNum(r.sessions),
                      value: r.sessions,
                      max: geoMax,
                    }))}
                    onInvestigateRow={(key) =>
                      askConversation(
                        `What does our ${key} audience look like? Where are they converting?`,
                        "kabir"
                      )
                    }
                  />
                </>
              )}
            </div>

            {/* Device mix */}
            <div className="mb-6">
              {loading || !data ? (
                <ChartSkeleton />
              ) : (
                <DeviceMixTile
                  data={data.device_mix}
                  onInvestigate={() =>
                    askConversation(
                      `How are mobile vs desktop users behaving differently for ${data.range.label}? What's the conversion gap?`,
                      "priya"
                    )
                  }
                />
              )}
            </div>
              </>
            )}

            {/* Footer: refreshed-at + manual refresh */}
            <div className="flex items-center justify-between text-[11px] font-mono text-[color:var(--text-tertiary)] pt-2 border-t border-[color:var(--border)]">
              <span>
                {lastFetchedAt
                  ? `Last refreshed ${secondsAgo(lastFetchedAt)}s ago`
                  : ""}
                {data?.sampled ? " · Sampled by GA4" : ""}
              </span>
              <button
                onClick={() => fetchDashboard(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 hover:text-[color:var(--text-primary)] tx-hover disabled:opacity-50"
              >
                <RefreshCw
                  strokeWidth={1.5}
                  className={`size-3 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh now
              </button>
            </div>
      </div>
    </div>
  );
}

function fmtCompactNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} cr`;
  if (Math.abs(n) >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-IN");
}

function secondsAgo(ts: number) {
  return Math.floor((Date.now() - ts) / 1000);
}

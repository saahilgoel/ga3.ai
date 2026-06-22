"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  ArrowUpRight,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DateRangePicker } from "@/components/dashboard/date-range-picker";
import { MainTable } from "./main-table";
import { RealtimeOverview as RealtimeOverviewMissionControl } from "./realtime-overview";
import { DemandMap, type DemandRow } from "./demand-map";
import type { ReportDef, KpiSpec } from "@/lib/reports/types";
import type { ReportResult, ReportRow } from "@/lib/reports/runner";
import { REPORTS_BY_PATH } from "@/lib/reports/registry";

type Props = { section: string; slug: string };

export function ReportRenderer({ section, slug }: Props) {
  const def = REPORTS_BY_PATH[`${section}/${slug}`];
  if (!def) {
    return (
      <div className="flex-1 flex items-center justify-center text-[color:var(--text-tertiary)] text-[13px]">
        Report not found.
      </div>
    );
  }
  return <ReportRendererInner def={def} />;
}

function ReportRendererInner({ def }: { def: ReportDef }) {
  const router = useRouter();
  const params = useSearchParams();
  const [preset, setPreset] = useState(params.get("range") ?? "last_7_days");
  const [compare, setCompare] = useState(params.get("compare") ?? "previous_period");
  const [data, setData] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(params.toString());
    if (preset !== "last_7_days") sp.set("range", preset);
    else sp.delete("range");
    if (compare !== "previous_period") sp.set("compare", compare);
    else sp.delete("compare");
    const qs = sp.toString();
    router.replace(`/reports/${def.section}/${def.slug}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, compare]);

  const fetchReport = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/reports/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            path: `${def.section}/${def.slug}`,
            range_preset: preset,
            refresh,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.detail || d.error || `HTTP ${res.status}`);
        }
        const json = (await res.json()) as { result: ReportResult };
        setData(json.result);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [def.section, def.slug, preset]
  );

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  function investigate() {
    const ctx = {
      dateRangeLabel: preset.replace(/_/g, " "),
      rows: data?.rows ?? [],
    };
    const prompt = def.investigatePrompt(ctx);
    const agent = def.primaryAgent === "any" ? "any" : def.primaryAgent;
    router.push(
      `/chat/new?${new URLSearchParams({ agent, ask: prompt }).toString()}`
    );
  }

  function exportCsv() {
    if (!data) return;
    const spec = def.layout.mainTable;
    if (!spec) {
      // Fallback: dump dimensions + metrics
      const headers = data.rows[0]
        ? [
            ...Object.keys(data.rows[0].dimensions),
            ...Object.keys(data.rows[0].metrics),
          ]
        : [];
      const lines = [headers.join(",")];
      for (const row of data.rows) {
        const vals = [
          ...Object.values(row.dimensions),
          ...Object.values(row.metrics),
        ].map(csvCell);
        lines.push(vals.join(","));
      }
      triggerDownload(`${def.slug}-${preset}.csv`, lines.join("\n"));
      return;
    }
    const headers = spec.columns.map((c) => c.label);
    const lines = [headers.join(",")];
    for (const row of data.rows) {
      const vals = spec.columns.map((c) =>
        csvCell(c.source === "dim" ? row.dimensions[c.key] : row.metrics[c.key])
      );
      lines.push(vals.join(","));
    }
    triggerDownload(`${def.slug}-${preset}.csv`, lines.join("\n"));
  }

  function onInvestigateRow(row: ReportRow) {
    const spec = def.layout.mainTable;
    if (!spec) return;
    const firstDim = spec.columns.find((c) => c.source === "dim");
    const key = firstDim ? row.dimensions[firstDim.key] : "(row)";
    const ctx = { dateRangeLabel: preset.replace(/_/g, " "), rows: [row] };
    const basePrompt = def.investigatePrompt(ctx);
    const prompt = `${basePrompt}\n\nFocus specifically on: ${key}.`;
    const agent = def.primaryAgent === "any" ? "any" : def.primaryAgent;
    router.push(
      `/chat/new?${new URLSearchParams({ agent, ask: prompt }).toString()}`
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] py-6 lg:py-8">
        <header className="flex items-baseline justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="font-mono text-[24px] font-medium tracking-[-0.02em] leading-[1.1]">
              {def.title}
            </h1>
            {def.description && (
              <p className="text-[13px] text-[color:var(--text-secondary)] mt-1">
                {def.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={!data || data.rows.length === 0}
              className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
              title="Export CSV"
            >
              <Download strokeWidth={1.5} className="size-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={() => fetchReport(true)}
              disabled={loading}
              className="h-8 px-3 rounded-md border border-[color:var(--border)] hover:bg-[color:var(--surface-hover)] tx-hover text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw
                strokeWidth={1.5}
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={investigate}
              disabled={!data}
              className="h-8 px-3 rounded-md bg-[color:var(--text-primary)] text-[color:var(--bg)] hover:bg-white tx-hover text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40"
            >
              <ArrowUpRight strokeWidth={1.5} className="size-3.5" />
              Investigate
            </button>
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

        {err && (
          <div
            className="rounded-md px-3 py-2 mb-4 text-[12px] flex items-center gap-2"
            style={{
              background: "rgba(208, 72, 72, 0.08)",
              border: "1px solid rgba(208, 72, 72, 0.2)",
              color: "var(--severity-high)",
            }}
          >
            <AlertTriangle strokeWidth={1.5} className="size-4 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {def.renderKind === "audience_overview" ? (
          <AudienceOverviewLayout def={def} data={data} loading={loading} />
        ) : def.renderKind === "cohort_heatmap" ? (
          <CohortHeatmap data={data} />
        ) : def.renderKind === "funnel_viz" ? (
          <FunnelVizLayout data={data} />
        ) : def.renderKind === "new_vs_returning" ? (
          <NewVsReturningLayout data={data} />
        ) : def.renderKind === "realtime_overview" ? (
          <RealtimeOverviewMissionControl />
        ) : def.renderKind === "demand_map" ? (
          <DemandMap
            data={
              (data?.customPayload as { queries?: DemandRow[] } | undefined)
                ?.queries ?? []
            }
            loading={loading}
          />
        ) : def.renderKind === "behavior_flow" ? (
          <BehaviorFlowPlaceholder data={data} />
        ) : (
          <DefaultLayout def={def} data={data} loading={loading} onInvestigateRow={onInvestigateRow} />
        )}

        <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] mt-4">
          {data?.generatedAt
            ? `Last fetched ${new Date(data.generatedAt * 1000).toLocaleTimeString()}`
            : ""}
        </div>
      </div>
    </div>
  );
}

function DefaultLayout({
  def,
  data,
  loading,
  onInvestigateRow,
}: {
  def: ReportDef;
  data: ReportResult | null;
  loading: boolean;
  onInvestigateRow: (row: ReportRow) => void;
}) {
  return (
    <>
      {def.layout.topChart && data?.timeseries && (
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 mb-4">
          <TimeseriesChart
            rows={data.timeseries}
            metrics={def.layout.topChart.metrics}
            kind={def.layout.topChart.kind}
          />
        </div>
      )}
      {def.layout.kpis && def.layout.kpis.length > 0 && data && (
        <KpiGrid kpis={def.layout.kpis} row={data.rows[0]} />
      )}
      {def.layout.mainTable && (
        <div className="mt-4">
          {loading && !data ? (
            <TableSkeleton />
          ) : (
            <MainTable
              spec={def.layout.mainTable}
              rows={data?.rows ?? []}
              onInvestigateRow={onInvestigateRow}
              emptyHint={def.emptyHint}
            />
          )}
        </div>
      )}
    </>
  );
}

function AudienceOverviewLayout({
  def,
  data,
  loading,
}: {
  def: ReportDef;
  data: ReportResult | null;
  loading: boolean;
}) {
  if (loading && !data) return <TableSkeleton />;
  if (!data) return null;
  return (
    <>
      {data.timeseries && (
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 mb-4">
          <TimeseriesChart
            rows={data.timeseries}
            metrics={["sessions", "totalUsers"]}
            kind="line"
          />
        </div>
      )}
      {def.layout.kpis && <KpiGrid kpis={def.layout.kpis} row={data.rows[0]} />}
    </>
  );
}

function KpiGrid({ kpis, row }: { kpis: KpiSpec[]; row?: ReportRow }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((k, i) => (
        <div
          key={i}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-3"
        >
          <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)]">
            {k.label}
          </div>
          <div className="mt-1.5 font-mono text-[22px] tabular-nums font-medium text-[color:var(--text-primary)]">
            {formatVal(row?.metrics[k.metric] ?? "0", k.format)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatVal(raw: string, format: KpiSpec["format"]): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw || "—";
  switch (format) {
    case "compact": {
      if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} cr`;
      if (Math.abs(n) >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
      if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
      return Math.round(n).toLocaleString("en-IN");
    }
    case "percent":
      return `${(n * 100).toFixed(1)}%`;
    case "duration_s": {
      const abs = Math.abs(n);
      if (abs < 1) return `${(n).toFixed(2)}s`;
      if (abs < 60) return `${Math.round(n)}s`;
      if (abs < 3600) {
        const m = Math.floor(abs / 60);
        const s = Math.round(abs % 60);
        return `${m}m ${s.toString().padStart(2, "0")}s`;
      }
      if (abs < 86_400) {
        const h = Math.floor(abs / 3600);
        const m = Math.round((abs % 3600) / 60);
        return `${h}h ${m.toString().padStart(2, "0")}m`;
      }
      // Fall back to compact-with-days for anything wildly large (a totals
      // metric snuck in here, e.g. lifetime engagement seconds).
      const d = Math.floor(abs / 86_400);
      if (d < 1000) {
        const h = Math.round((abs % 86_400) / 3600);
        return `${d}d ${h}h`;
      }
      const years = abs / 31_536_000;
      return `${years.toFixed(1)}y`;
    }
    case "int":
    default:
      return Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toFixed(2);
  }
}

function TimeseriesChart({
  rows,
  metrics,
  kind,
}: {
  rows: ReportRow[];
  metrics: string[];
  kind: "line" | "area" | "stackedArea";
}) {
  // Build series, GA4 'date' dim returns YYYYMMDD
  const series = useMemo(() => {
    const map = new Map<string, Record<string, number> & { date: string }>();
    for (const r of rows) {
      const d = r.dimensions.date || "";
      const fmt = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
      const existing = map.get(fmt) ?? ({ date: fmt } as Record<string, number> & { date: string });
      for (const m of metrics) {
        existing[m] = (existing[m] ?? 0) + Number(r.metrics[m] || 0);
      }
      map.set(fmt, existing);
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, metrics]);

  if (series.length === 0) {
    return <div className="text-[12px] text-[color:var(--text-tertiary)] py-4">No data</div>;
  }

  const Chart = kind === "line" ? LineChart : AreaChart;
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={series} margin={{ top: 10, right: 12, bottom: 10, left: 12 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fontFamily: "monospace", fill: "var(--text-tertiary)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={32}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "monospace",
            }}
            labelStyle={{ color: "var(--text-primary)" }}
            itemStyle={{ color: "var(--text-secondary)" }}
            formatter={(v) => Number(v).toLocaleString("en-IN")}
          />
          {metrics.map((m, i) =>
            kind === "line" ? (
              <Line
                key={m}
                type="monotone"
                dataKey={m}
                stroke={i === 0 ? "var(--accent, var(--text-primary))" : "var(--text-secondary)"}
                strokeOpacity={i === 0 ? 1 : 0.6}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ) : (
              <Area
                key={m}
                type="monotone"
                dataKey={m}
                stroke={i === 0 ? "var(--accent, var(--text-primary))" : "var(--text-secondary)"}
                fill={i === 0 ? "var(--accent, var(--text-primary))" : "var(--text-secondary)"}
                fillOpacity={0.15}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            )
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

function CohortHeatmap({ data }: { data: ReportResult | null }) {
  if (!data) return <TableSkeleton />;
  const payload = data.customPayload as { cohorts?: string[]; maxWeek?: number } | undefined;
  const cohorts = payload?.cohorts ?? [];
  const maxWeek = payload?.maxWeek ?? 0;
  // Pivot: cohort -> week -> users
  const grid = new Map<string, Map<number, number>>();
  for (const row of data.rows) {
    const c = row.dimensions.cohort;
    const w = Number(row.dimensions.week);
    const u = Number(row.metrics.users);
    const m = grid.get(c) ?? new Map<number, number>();
    m.set(w, u);
    grid.set(c, m);
  }
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 text-[10px] uppercase text-[color:var(--text-tertiary)] border-b border-[color:var(--border)]">
                Cohort
              </th>
              {Array.from({ length: maxWeek + 1 }, (_, i) => (
                <th
                  key={i}
                  className="px-2 py-2 text-[10px] uppercase text-[color:var(--text-tertiary)] border-b border-[color:var(--border)]"
                >
                  W{i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((c) => {
              const m = grid.get(c);
              const base = m?.get(0) ?? 0;
              return (
                <tr key={c} className="border-b border-[color:var(--border)] last:border-b-0">
                  <td className="px-3 py-1.5 text-[color:var(--text-secondary)]">{c}</td>
                  {Array.from({ length: maxWeek + 1 }, (_, w) => {
                    const v = m?.get(w) ?? 0;
                    if (w === 0) {
                      return (
                        <td key={w} className="px-2 py-1.5 text-[color:var(--text-primary)]">
                          {v.toLocaleString("en-IN")}
                        </td>
                      );
                    }
                    const pct = base > 0 ? (v / base) * 100 : 0;
                    return (
                      <td
                        key={w}
                        className="px-2 py-1.5 text-center text-[color:var(--text-primary)]"
                        style={{
                          background: v > 0 ? `rgba(126, 170, 138, ${Math.min(0.5, pct / 100)})` : "transparent",
                        }}
                      >
                        {v > 0 ? `${pct.toFixed(0)}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FunnelVizLayout({ data }: { data: ReportResult | null }) {
  if (!data) return <TableSkeleton />;
  const payload = data.customPayload as
    | { error?: string; kind?: string; steps?: Array<{ name: string; users: number; drop_pct: number }> }
    | undefined;
  if (payload?.error) {
    return (
      <div className="text-[12px] text-[color:var(--text-tertiary)]">
        Couldn&apos;t detect a funnel — set up enhanced measurement or ecommerce events.
      </div>
    );
  }
  const steps = payload?.steps ?? [];
  const max = Math.max(1, ...steps.map((s) => s.users));
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)] mb-3">
        Auto-detected {payload?.kind} funnel
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i}>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="font-medium">{i + 1}. {s.name}</span>
              <span className="font-mono tabular-nums">
                {s.users.toLocaleString("en-IN")} users
                {s.drop_pct > 0 && (
                  <span className="ml-2 text-[color:var(--severity-medium)]">
                    -{s.drop_pct.toFixed(1)}%
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[color:var(--border)] overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${(s.users / max) * 100}%`,
                  background: "var(--accent, var(--text-primary))",
                  opacity: 0.5,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewVsReturningLayout({ data }: { data: ReportResult | null }) {
  if (!data) return <TableSkeleton />;
  const newRow = data.rows.find((r) => r.dimensions.newVsReturning?.toLowerCase().includes("new"));
  const retRow = data.rows.find((r) => r.dimensions.newVsReturning?.toLowerCase().includes("return"));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[
        { title: "New", row: newRow },
        { title: "Returning", row: retRow },
      ].map((g) => (
        <div
          key={g.title}
          className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
        >
          <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)] mb-2">
            {g.title}
          </div>
          {!g.row ? (
            <div className="text-[12px] text-[color:var(--text-tertiary)]">No data</div>
          ) : (
            (() => {
              const row = g.row;
              return (
                <div className="grid grid-cols-2 gap-3">
                  {(["sessions", "totalUsers", "keyEvents", "engagementRate"] as const).map((m) => (
                    <div key={m}>
                      <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] uppercase">
                        {m}
                      </div>
                      <div className="font-mono tabular-nums text-[16px] mt-0.5 text-[color:var(--text-primary)]">
                        {m === "engagementRate"
                          ? `${(Number(row.metrics[m] || 0) * 100).toFixed(1)}%`
                          : Number(row.metrics[m] || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </div>
      ))}
    </div>
  );
}

function RealtimeOverview() {
  const [data, setData] = useState<{ active_users: number; hourly_avg: number } | null>(null);
  useEffect(() => {
    let stopped = false;
    async function tick() {
      try {
        const res = await fetch("/api/dashboard/realtime");
        if (!res.ok || stopped) return;
        setData(await res.json());
      } catch {
        /* ignore */
      }
    }
    tick();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, 30_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-8 flex items-center justify-center">
      <div className="text-center">
        <div className="text-[10px] font-mono uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
          Active right now
        </div>
        <div className="font-mono text-[64px] tabular-nums font-medium mt-2 text-[color:var(--text-primary)]">
          {data?.active_users ?? "—"}
        </div>
        <div className="text-[12px] font-mono text-[color:var(--text-secondary)] mt-2">
          {data ? `vs avg ${data.hourly_avg}/hr` : "loading…"}
        </div>
      </div>
    </div>
  );
}

function BehaviorFlowPlaceholder({ data }: { data: ReportResult | null }) {
  if (!data) return <TableSkeleton />;
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div
        className="rounded-md px-3 py-2 mb-4 text-[12px] flex items-center gap-2"
        style={{
          background: "rgba(212, 165, 92, 0.08)",
          border: "1px solid rgba(212, 165, 92, 0.2)",
          color: "var(--severity-medium)",
        }}
      >
        <AlertTriangle strokeWidth={1.5} className="size-4 shrink-0" />
        Sankey rendering coming soon. Showing top pages by traffic for now.
      </div>
      <table className="w-full text-[12px]">
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={i} className="border-b border-[color:var(--border)] last:border-b-0">
              <td className="px-3 py-2 text-[color:var(--text-secondary)] truncate max-w-[600px]">
                {r.dimensions.pagePath}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums text-right">
                {Number(r.metrics.screenPageViews || 0).toLocaleString("en-IN")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 animate-pulse">
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-6 rounded bg-[color:var(--surface-elevated)]"
            style={{ width: `${90 - i * 4}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function csvCell(v: string | undefined): string {
  const s = (v ?? "").toString();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

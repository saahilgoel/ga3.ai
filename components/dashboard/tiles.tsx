"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  Minus,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEventStream, type StreamEvent } from "@/lib/use-event-stream";

// ------ Shared shapes (mirror lib/dashboard.ts) ------
export type Kpi = {
  current: number;
  prior: number | null;
  delta_pct: number | null;
  sparkline: number[];
};
export type TailoredKpi = {
  key: string;
  label: string;
  value: number;
  format: "number" | "currency" | "percent" | "duration";
};
export type TailoredDashboard = {
  business_type: string;
  label: string;
  kpis: TailoredKpi[];
  funnel?: { title: string; steps: Array<{ name: string; value: number }> };
  list?: {
    title: string;
    format: "number" | "currency";
    rows: Array<{ name: string; value: number }>;
  };
  cohort?: {
    weeks: number;
    rows: Array<{ label: string; size: number; retention: number[] }>;
  };
};
export type DashboardData = {
  range: { start: string; end: string; label: string };
  compare_range: { start: string; end: string } | null;
  realtime: { active_users: number; hourly_avg: number } | null;
  kpi: {
    sessions: Kpi;
    users: Kpi;
    engagement_rate: Kpi;
    conversions: Kpi;
  };
  traffic_over_time: {
    granularity: "daily" | "weekly" | "monthly";
    series: Array<{ date: string; sessions: number; users: number }>;
  };
  top_channels: Array<{
    channel: string;
    sessions: number;
    conversions: number;
    share_pct: number;
  }>;
  top_landing_pages: Array<{
    path: string;
    sessions: number;
    conversions: number;
    engagement_rate: number;
  }>;
  top_geography: {
    granularity: "city" | "country";
    rows: Array<{ name: string; sessions: number }>;
  };
  device_mix: {
    rows: Array<{
      device: string;
      sessions: number;
      share_pct: number;
      conversion_rate: number;
    }>;
  };
  tailored: TailoredDashboard | null;
  sampled: boolean;
};

const ACCENT = "var(--accent, var(--text-primary))";
const POS = "#7EAA8A"; // muted green
const NEG = "#D49D9D"; // muted rose

// ------ Helpers ------

function formatIndian(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(decimals);
  if (decimals === 0) return Math.round(n).toLocaleString("en-IN");
  // toLocaleString with minimumFractionDigits keeps the Indian grouping
  return Number(fixed).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)} cr`;
  if (Math.abs(n) >= 1_00_000) return `${(n / 1_00_000).toFixed(2)} L`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatIndian(n);
}

// ------ Realtime tile ------

export function RealtimeTile({
  initial,
  onInvestigate,
}: {
  initial: { active_users: number; hourly_avg: number } | null;
  onInvestigate: () => void;
}) {
  const [data, setData] = useState(initial);
  const [pulse, setPulse] = useState(false);
  const [lastUsers, setLastUsers] = useState(initial?.active_users ?? 0);

  // Realtime updates now arrive via SSE — the server runs one upstream
  // poll per workspace and fans it out to all subscribed tabs.
  useEventStream((ev: StreamEvent) => {
    if (ev.kind !== "realtime.update") return;
    setData({ active_users: ev.active_users, hourly_avg: ev.hourly_avg });
    if (ev.active_users !== lastUsers) {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
      setLastUsers(ev.active_users);
    }
  });

  if (!data) {
    return null;
  }
  const delta = data.active_users - data.hourly_avg;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return (
    <button
      onClick={onInvestigate}
      className="w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 h-12 flex items-center gap-3 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover group"
    >
      <span
        aria-hidden
        className={`size-2 rounded-full ${pulse ? "animate-ping" : ""}`}
        style={{ background: POS }}
      />
      <span
        aria-hidden
        className="size-2 rounded-full -ml-3.5"
        style={{ background: POS }}
      />
      <span className="font-mono text-[15px] font-medium tabular-nums text-[color:var(--text-primary)]">
        {formatIndian(data.active_users)} active right now
      </span>
      <span className="font-mono text-[12px] tabular-nums text-[color:var(--text-secondary)] flex items-center gap-1">
        {direction === "up" ? (
          <ArrowUp strokeWidth={1.5} className="size-3" style={{ color: POS }} />
        ) : direction === "down" ? (
          <ArrowDown strokeWidth={1.5} className="size-3" style={{ color: NEG }} />
        ) : (
          <Minus strokeWidth={1.5} className="size-3 text-[color:var(--text-tertiary)]" />
        )}
        vs avg {formatIndian(data.hourly_avg)}/hr
      </span>
      <span className="flex-1" />
      <ArrowUpRight
        strokeWidth={1.5}
        className="size-3.5 text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100 tx-hover"
      />
    </button>
  );
}

// ------ KPI tile ------

export function KpiTile({
  label,
  kpi,
  format,
  onInvestigate,
}: {
  label: string;
  kpi: Kpi;
  format: "number" | "percent" | "compact";
  onInvestigate: () => void;
}) {
  const value =
    format === "percent"
      ? `${formatIndian(kpi.current, 1)}%`
      : format === "compact"
      ? fmtCompact(kpi.current)
      : formatIndian(kpi.current);
  const delta = kpi.delta_pct;
  const dir = delta == null ? "flat" : delta > 0.1 ? "up" : delta < -0.1 ? "down" : "flat";
  const priorLabel = kpi.prior != null ? `${fmtCompact(kpi.prior)} prior` : "no prior";
  return (
    <button
      onClick={onInvestigate}
      className="text-left rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover group relative"
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
      <div className="font-mono text-[28px] lg:text-[32px] font-medium tabular-nums leading-none text-[color:var(--text-primary)]">
        {value}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[12px] font-mono tabular-nums">
        {dir === "up" ? (
          <ArrowUp strokeWidth={1.5} className="size-3" style={{ color: POS }} />
        ) : dir === "down" ? (
          <ArrowDown strokeWidth={1.5} className="size-3" style={{ color: NEG }} />
        ) : (
          <Minus strokeWidth={1.5} className="size-3 text-[color:var(--text-tertiary)]" />
        )}
        <span
          style={{
            color: dir === "up" ? POS : dir === "down" ? NEG : "var(--text-tertiary)",
          }}
        >
          {delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
        </span>
        <span className="text-[color:var(--text-tertiary)] ml-1">{priorLabel}</span>
      </div>
      <div className="mt-3 h-[40px] hidden lg:block">
        {kpi.sparkline.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={kpi.sparkline.map((v, i) => ({ i, v }))}
              margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
            >
              <Line
                type="monotone"
                dataKey="v"
                stroke={ACCENT}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </button>
  );
}

// ------ Traffic chart tile ------

export function TrafficChartTile({
  data,
  onInvestigate,
}: {
  data: DashboardData["traffic_over_time"];
  onInvestigate: () => void;
}) {
  return (
    <button
      onClick={onInvestigate}
      className="w-full text-left rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover group"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[15px] font-medium">Traffic over time</span>
        <span className="text-[11px] font-mono text-[color:var(--text-tertiary)] flex items-center gap-1">
          {data.granularity}
          <ArrowUpRight
            strokeWidth={1.5}
            className="size-3 opacity-0 group-hover:opacity-100 tx-hover"
          />
        </span>
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.series}
            margin={{ top: 10, right: 12, bottom: 10, left: 12 }}
          >
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
              formatter={(v) => formatIndian(Number(v))}
            />
            <Line
              type="monotone"
              dataKey="sessions"
              stroke={ACCENT}
              strokeWidth={1.5}
              dot={false}
              name="Sessions"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="users"
              stroke="var(--text-secondary)"
              strokeOpacity={0.6}
              strokeWidth={1.5}
              dot={false}
              name="Users"
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </button>
  );
}

// ------ List tile (channels, pages, geography) ------

export function ListTile({
  title,
  rows,
  rightColumn,
  onInvestigateRow,
  emptyLabel,
}: {
  title: string;
  rows: Array<{ key: string; label: string; primary: string; right?: string; value: number; max: number }>;
  rightColumn?: string;
  onInvestigateRow: (key: string) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)]">
          {title}
        </span>
        {rightColumn && (
          <span className="text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)]">
            {rightColumn}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-[color:var(--text-tertiary)] py-4">
          {emptyLabel ?? "No data"}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.key}>
              <button
                onClick={() => onInvestigateRow(r.key)}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[color:var(--surface-hover)] tx-hover group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[12px] truncate flex-1 text-[color:var(--text-primary)]">
                    {r.label}
                  </span>
                  <span className="font-mono text-[12px] tabular-nums text-[color:var(--text-secondary)] shrink-0">
                    {r.primary}
                  </span>
                  {r.right && (
                    <span className="font-mono text-[11px] tabular-nums text-[color:var(--text-tertiary)] shrink-0 w-12 text-right">
                      {r.right}
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1 rounded-full bg-[color:var(--border)] overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, (r.value / Math.max(r.max, 1)) * 100)}%`,
                      background: ACCENT,
                      opacity: 0.3,
                    }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ------ Device mix tile ------

const DEVICE_COLORS: Record<string, string> = {
  mobile: "#7EAA8A", // priya green
  desktop: "#8AA3C8", // kabir blue
  tablet: "var(--text-tertiary)",
};

export function DeviceMixTile({
  data,
  onInvestigate,
}: {
  data: DashboardData["device_mix"];
  onInvestigate: () => void;
}) {
  const rows = data.rows.filter((r) => r.sessions > 0).slice(0, 3);
  return (
    <button
      onClick={onInvestigate}
      className="w-full text-left rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 hover:bg-[color:var(--surface-hover)] hover:border-[color:var(--border-strong)] tx-hover group"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.08em] font-mono text-[color:var(--text-tertiary)]">
          Device mix
        </span>
        <ArrowUpRight
          strokeWidth={1.5}
          className="size-3 text-[color:var(--text-tertiary)] opacity-0 group-hover:opacity-100 tx-hover"
        />
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-[color:var(--text-tertiary)]">No data</div>
      ) : (
        <>
          <div className="flex h-6 rounded-md overflow-hidden">
            {rows.map((r) => (
              <div
                key={r.device}
                style={{
                  width: `${r.share_pct}%`,
                  background: DEVICE_COLORS[r.device] ?? "var(--text-tertiary)",
                }}
                title={`${r.device} ${r.share_pct.toFixed(1)}%`}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {rows.map((r) => (
              <div key={r.device}>
                <div className="text-[11px] font-mono text-[color:var(--text-secondary)] capitalize flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: DEVICE_COLORS[r.device] ?? "var(--text-tertiary)" }}
                  />
                  {r.device}
                </div>
                <div className="font-mono text-[13px] tabular-nums mt-0.5 text-[color:var(--text-primary)]">
                  {r.share_pct.toFixed(1)}%
                </div>
                <div className="text-[10px] font-mono text-[color:var(--text-tertiary)] tabular-nums">
                  {fmtCompact(r.sessions)} sessions
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </button>
  );
}

// ------ Skeleton placeholders ------

export function KpiSkeleton() {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 animate-pulse">
      <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)]" />
      <div className="h-8 w-24 mt-2 rounded bg-[color:var(--surface-elevated)]" />
      <div className="h-3 w-32 mt-3 rounded bg-[color:var(--surface-elevated)]" />
      <div className="h-10 w-full mt-3 rounded bg-[color:var(--surface-elevated)]" />
    </div>
  );
}
export function ListSkeleton() {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 animate-pulse">
      <div className="h-3 w-24 rounded bg-[color:var(--surface-elevated)]" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 rounded bg-[color:var(--surface-elevated)]" />
        ))}
      </div>
    </div>
  );
}
export function ChartSkeleton() {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 animate-pulse">
      <div className="h-3 w-32 rounded bg-[color:var(--surface-elevated)]" />
      <div className="h-[280px] mt-3 rounded bg-[color:var(--surface-elevated)]" />
    </div>
  );
}

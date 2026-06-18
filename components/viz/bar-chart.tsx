"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function BarChartViz({
  data,
  color,
  compact = false,
}: {
  data: Array<{ label: string; value: number; secondary?: number }>;
  color: string;
  compact?: boolean;
}) {
  // Coerce to finite numbers and drop bad rows so one NaN/string can't break
  // the axis math or the render.
  const rows = (data ?? [])
    .map((d) => ({
      label: String(d?.label ?? ""),
      value: Number(d?.value),
      secondary:
        typeof d?.secondary === "number" && Number.isFinite(d.secondary)
          ? d.secondary
          : undefined,
    }))
    .filter((d) => Number.isFinite(d.value));

  if (rows.length === 0) {
    return (
      <div className="text-[12px] text-[color:var(--text-tertiary)] py-2">
        No data to chart.
      </div>
    );
  }

  const hasSecondary = rows.some((d) => typeof d.secondary === "number");
  const fontSize = compact ? 9 : 11;
  const yWidth = compact ? 88 : 150;

  // Fit the axis to the actual data range (always including 0) with headroom
  // for the value labels — so MIXED-SIGN data (e.g. a +95.7 riser among
  // negative fallers) renders without clipping or labels colliding into the
  // category names.
  const vals = rows.flatMap((d) =>
    typeof d.secondary === "number" ? [d.value, d.secondary] : [d.value]
  );
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const pad = ((hi - lo) || Math.abs(hi) || 1) * 0.16;
  const domain: [number, number] = [lo < 0 ? lo - pad : 0, hi > 0 ? hi + pad : pad];

  const truncate = (s: string, n: number) =>
    s.length > n ? `${s.slice(0, n - 1)}…` : s;

  return (
    <div style={{ height: compact ? 120 : 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 2, right: compact ? 28 : 24, bottom: 2, left: compact ? 4 : 8 }}
        >
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={domain}
            tick={{ fill: "#525252", fontSize }}
            tickFormatter={(v) => formatCompact(Number(v))}
            stroke="#1f1f1f"
            hide={compact}
          />
          <YAxis
            dataKey="label"
            type="category"
            tick={{ fill: "#a3a3a3", fontSize }}
            tickFormatter={(v) => truncate(String(v), compact ? 12 : 26)}
            width={yWidth}
            stroke="#1f1f1f"
            interval={0}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              background: "#0a0a0a",
              border: "1px solid #27272a",
              fontSize: 12,
            }}
            // Full label in the tooltip even when the axis truncates it.
            labelFormatter={(l) => String(l)}
            formatter={(v) => Number(v).toLocaleString()}
          />
          <Bar dataKey="value" fill={color} radius={[0, 2, 2, 0]} animationDuration={200}>
            <LabelList
              dataKey="value"
              position="right"
              fill="#a3a3a3"
              fontSize={fontSize}
              formatter={(v) => formatCompact(Number(v))}
            />
          </Bar>
          {hasSecondary && (
            <Bar
              dataKey="secondary"
              fill={`${color}80`}
              radius={[0, 2, 2, 0]}
              animationDuration={200}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

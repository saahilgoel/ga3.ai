"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function LineChartViz({
  data,
  color,
  compact = false,
}: {
  data: Array<{ label: string; value: number; secondary?: number }>;
  color: string;
  compact?: boolean;
}) {
  const hasSecondary = data.some((d) => typeof d.secondary === "number");
  return (
    <div style={{ height: compact ? 120 : 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            stroke="#27272a"
            tickMargin={6}
          />
          <YAxis
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            stroke="#27272a"
            tickFormatter={(v) => formatCompact(Number(v))}
          />
          <Tooltip
            contentStyle={{
              background: "#0a0a0a",
              border: "1px solid #27272a",
              fontSize: 12,
            }}
            formatter={(v) => Number(v).toLocaleString()}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color }}
          />
          {hasSecondary && (
            <Line
              type="monotone"
              dataKey="secondary"
              stroke={`${color}80`}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

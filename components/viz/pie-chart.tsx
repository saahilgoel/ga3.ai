"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export function PieChartViz({
  data,
  color,
  compact = false,
}: {
  data: Array<{ label: string; value: number }>;
  color: string;
  compact?: boolean;
}) {
  const palette = generatePalette(color, data.length);
  return (
    <div style={{ height: compact ? 120 : 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={50}
            outerRadius={100}
            paddingAngle={2}
            label={(d) => (d as { label?: string }).label ?? ""}
            labelLine={{ stroke: "#52525b" }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i]} stroke="#0a0a0a" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#0a0a0a",
              border: "1px solid #27272a",
              fontSize: 12,
            }}
            formatter={(v) => Number(v).toLocaleString()}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function generatePalette(base: string, n: number): string[] {
  // Vary alpha to make a single-hue palette
  if (n <= 1) return [base];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const alpha = Math.round(255 * (1 - i / (n + 2)))
      .toString(16)
      .padStart(2, "0");
    out.push(`${base}${alpha}`);
  }
  return out;
}

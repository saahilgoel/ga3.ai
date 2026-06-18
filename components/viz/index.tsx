"use client";

import { motion } from "framer-motion";
import type { Visualization } from "@/lib/viz";
import { AGENT_HEX } from "@/lib/viz";
import { AGENT_MAP } from "@/lib/agents";
import { BarChartViz } from "./bar-chart";
import { LineChartViz } from "./line-chart";
import { PieChartViz } from "./pie-chart";
import { KpiCard } from "./kpi-card";
import { DataTable } from "./data-table";
import { FunnelChartViz } from "./funnel-chart";
import { ErrorBoundary } from "@/components/error-boundary";

export function colorForAgent(agentId?: string | null): string {
  if (agentId && AGENT_MAP[agentId]) {
    return AGENT_HEX[AGENT_MAP[agentId].color] || AGENT_HEX.default;
  }
  return AGENT_HEX.default;
}

export function VisualizationRenderer({
  viz,
  agentId,
  compact = false,
}: {
  viz: Visualization;
  agentId?: string | null;
  compact?: boolean;
}) {
  const color = colorForAgent(agentId);
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
      className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] overflow-hidden"
    >
      <div className={`px-3 ${compact ? "py-1.5" : "py-2.5"} border-b border-[color:var(--border)] flex items-center gap-2`}>
        <span
          className="size-1.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className={`${compact ? "text-[11px]" : "text-[13px]"} font-semibold truncate`}>
          {viz.title}
        </div>
      </div>
      <div className={compact ? "p-2" : "p-4"}>
        <ErrorBoundary
          label={`viz:${viz.kind}`}
          fallback={
            <div className="text-[12px] text-[color:var(--text-tertiary)] py-2">
              Couldn&apos;t render this chart.
            </div>
          }
        >
          {viz.kind === "kpi" && viz.primary && (
            <KpiCard primary={viz.primary} color={color} compact={compact} />
          )}
          {viz.kind === "bar" && viz.data && viz.data.length > 0 && (
            <BarChartViz data={viz.data} color={color} compact={compact} />
          )}
          {viz.kind === "line" && viz.data && viz.data.length > 0 && (
            <LineChartViz data={viz.data} color={color} compact={compact} />
          )}
          {viz.kind === "pie" && viz.data && viz.data.length > 0 && (
            <PieChartViz data={viz.data} color={color} compact={compact} />
          )}
          {viz.kind === "funnel" && viz.steps && viz.steps.length > 0 && (
            <FunnelChartViz steps={viz.steps} color={color} compact={compact} />
          )}
          {viz.kind === "table" && viz.columns && viz.rows && (
            <DataTable columns={viz.columns} rows={viz.rows} />
          )}
        </ErrorBoundary>
      </div>
      {viz.caption && !compact && (
        <div className="px-3 py-1.5 border-t border-[color:var(--border)] text-[11px] text-[color:var(--text-tertiary)]">
          {viz.caption}
        </div>
      )}
    </motion.div>
  );
}

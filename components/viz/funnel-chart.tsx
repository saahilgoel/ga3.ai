"use client";

export function FunnelChartViz({
  steps,
  color,
  compact = false,
}: {
  steps: Array<{ label: string; count: number }>;
  color: string;
  compact?: boolean;
}) {
  void compact;
  // Be tolerant of upstream shape drift: counts can arrive as strings, under a
  // `value` key, or missing. Coerce to finite numbers and drop bad steps so a
  // single malformed value can't throw the whole chart.
  const safe = (steps ?? [])
    .map((s) => ({
      label: String(s?.label ?? ""),
      count: Number(
        (s as { count?: unknown; value?: unknown })?.count ??
          (s as { value?: unknown })?.value ??
          NaN
      ),
    }))
    .filter((s) => Number.isFinite(s.count));
  if (safe.length === 0) {
    return (
      <div className="text-[12px] text-[color:var(--text-tertiary)] py-2">
        No funnel data to show.
      </div>
    );
  }
  const max = Math.max(...safe.map((s) => s.count), 0);
  return (
    <div className="space-y-1">
      {safe.map((s, i) => {
        const widthPct = max > 0 ? Math.max(8, (s.count / max) * 100) : 8;
        const prev = i > 0 ? safe[i - 1].count : null;
        const dropPct =
          prev != null && prev > 0 ? ((prev - s.count) / prev) * 100 : null;
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium truncate">{s.label}</span>
              <span className="tabular-nums text-[color:var(--muted-foreground)]">
                {s.count.toLocaleString()}
              </span>
            </div>
            <div className="h-7 rounded-md bg-[color:var(--muted)] relative overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${widthPct}%`, background: color }}
              />
            </div>
            {dropPct != null && (
              <div className="text-[10px] text-rose-400 mt-0.5 pl-1">
                ↓ {dropPct.toFixed(1)}% drop
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

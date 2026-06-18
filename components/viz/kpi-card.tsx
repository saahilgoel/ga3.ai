"use client";

export function KpiCard({
  primary,
  color,
  compact = false,
}: {
  primary: {
    label: string;
    value: string;
    change_pct?: number;
    change_direction?: "up" | "down" | "flat";
  };
  color: string;
  compact?: boolean;
}) {
  const dir = primary.change_direction;
  const changeColor =
    dir === "up"
      ? "var(--severity-low)"
      : dir === "down"
      ? "var(--severity-high)"
      : "var(--text-tertiary)";
  const arrow = dir === "up" ? "↑" : dir === "down" ? "↓" : "→";

  return (
    <div className="flex flex-col items-start gap-1 py-1">
      <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--text-tertiary)]">
        {primary.label}
      </div>
      <div className="flex items-baseline gap-2">
        <div
          className={`${compact ? "text-[24px]" : "text-[36px]"} font-semibold font-mono tabular-nums leading-none`}
          style={{ color }}
        >
          {primary.value}
        </div>
        {typeof primary.change_pct === "number" && (
          <div
            className={`text-[12px] font-medium font-mono tabular-nums`}
            style={{ color: dir === "up" ? "#10b981" : dir === "down" ? "#ef4444" : "var(--text-tertiary)" }}
          >
            <span className="mr-0.5">{arrow}</span>
            {primary.change_pct > 0 ? "+" : ""}
            {primary.change_pct.toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

export type DashboardView = "audience" | "paid" | "unified";

export function ViewToggle({
  view,
  onChange,
}: {
  view: DashboardView;
  onChange: (v: DashboardView) => void;
}) {
  const opts: Array<{ id: DashboardView; label: string }> = [
    { id: "audience", label: "Audience" },
    { id: "paid", label: "Paid" },
    { id: "unified", label: "Unified" },
  ];
  return (
    <div className="inline-flex rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] p-0.5">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`h-7 px-3 rounded text-[12px] tx-hover font-medium ${
            view === o.id
              ? "bg-[color:var(--surface-elevated)] text-[color:var(--text-primary)]"
              : "text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          }`}
          style={
            view === o.id
              ? { boxShadow: "inset 0 0 0 1px var(--border-strong)" }
              : undefined
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

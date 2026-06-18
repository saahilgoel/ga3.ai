// Dashboard skeleton — matches the live layout: header row, KPI 4-tile grid,
// then traffic chart, then 3-col list grid. Streams instantly while server
// resolves session + workspace.

export default function DashboardLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] py-6 lg:py-8 animate-pulse">
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-3">
          <div>
            <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
            <div className="h-8 w-56 mt-2 rounded bg-[color:var(--surface-elevated)]" />
          </div>
          <div className="flex gap-2">
            <div className="h-7 w-40 rounded bg-[color:var(--surface-elevated)]" />
            <div className="h-7 w-32 rounded bg-[color:var(--surface-elevated)]" />
          </div>
        </div>
        <div className="h-3 w-72 mt-3 mb-6 rounded bg-[color:var(--surface-elevated)]" />

        <div className="h-12 mb-4 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
            >
              <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-8 w-24 mt-2 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-3 w-32 mt-3 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-10 w-full mt-3 rounded bg-[color:var(--surface-elevated)]" />
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4 mb-6">
          <div className="h-3 w-32 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-[280px] mt-3 rounded bg-[color:var(--surface-elevated)]" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
            >
              <div className="h-3 w-24 rounded bg-[color:var(--surface-elevated)]" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-6 rounded bg-[color:var(--surface-elevated)]"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

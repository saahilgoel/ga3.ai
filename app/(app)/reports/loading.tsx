// Reports skeleton — accounts for the 220px sub-nav rail + content area.

export default function ReportsLoading() {
  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-[220px] shrink-0 border-r border-[color:var(--border)] bg-[color:var(--surface)] hidden md:block">
        <div className="px-3 py-4 animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-6 w-32 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-6 w-28 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-6 w-32 rounded bg-[color:var(--surface-elevated)]" />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] py-6 lg:py-8 animate-pulse">
          <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-7 w-72 mt-2 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-3 w-96 mt-2 rounded bg-[color:var(--surface-elevated)]" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-9 rounded bg-[color:var(--surface)] border border-[color:var(--border)]"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

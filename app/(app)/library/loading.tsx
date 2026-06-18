// Library skeleton — filter rail + card grid.

export default function LibraryLoading() {
  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-[240px] shrink-0 border-r border-[color:var(--border)] bg-[color:var(--surface)] hidden md:block">
        <div className="p-4 animate-pulse space-y-4">
          <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)]" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
              {Array.from({ length: 4 }).map((_, j) => (
                <div
                  key={j}
                  className="h-5 w-32 rounded bg-[color:var(--surface-elevated)]"
                />
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1200px] py-6 animate-pulse">
          <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-7 w-56 mt-2 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-10 w-full mt-6 rounded-lg bg-[color:var(--surface)] border border-[color:var(--border)]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
              >
                <div className="h-3 w-24 rounded bg-[color:var(--surface-elevated)]" />
                <div className="h-5 w-3/4 rounded bg-[color:var(--surface-elevated)] mt-2" />
                <div className="h-3 w-full rounded bg-[color:var(--surface-elevated)] mt-2" />
                <div className="h-3 w-5/6 rounded bg-[color:var(--surface-elevated)] mt-1.5" />
                <div className="h-3 w-1/3 rounded bg-[color:var(--surface-elevated)] mt-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1000px] py-6 lg:py-8 animate-pulse">
        <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
        <div className="h-8 w-64 mt-2 rounded bg-[color:var(--surface-elevated)]" />
        <div className="h-3 w-48 mt-3 rounded bg-[color:var(--surface-elevated)]" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-6 mb-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
            >
              <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-7 w-16 mt-2 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-3 w-32 mt-2 rounded bg-[color:var(--surface-elevated)]" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-5 mb-6">
          <div className="h-4 w-48 rounded bg-[color:var(--surface-elevated)]" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
                <div className="h-5 w-24 rounded bg-[color:var(--surface-elevated)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

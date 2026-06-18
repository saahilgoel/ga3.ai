export default function FeedLoading() {
  return (
    <div className="flex-1 flex flex-col min-w-0 relative overflow-hidden">
      <div className="border-b border-[color:var(--border)] px-4 lg:px-6 py-3 animate-pulse">
        <div className="h-6 w-32 rounded bg-[color:var(--surface-elevated)]" />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[920px] py-6 lg:py-8 animate-pulse space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="size-5 rounded-full bg-[color:var(--surface-elevated)]" />
                <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
                <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)] ml-auto" />
              </div>
              <div className="h-5 w-3/4 rounded bg-[color:var(--surface-elevated)] mt-2" />
              <div className="h-3 w-full rounded bg-[color:var(--surface-elevated)] mt-2" />
              <div className="h-3 w-5/6 rounded bg-[color:var(--surface-elevated)] mt-1.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

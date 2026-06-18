// Streams instantly while the route's server component is resolving.
// Sidebar + TopBar are already on screen (rendered by the layout), so this
// only fills the content area. Result: every click registers in <50ms even
// on a cold server-component resolve.

export default function Loading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1080px] py-6 lg:py-8">
        <div className="animate-pulse">
          <div className="h-3 w-20 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-8 w-64 mt-3 rounded bg-[color:var(--surface-elevated)]" />
          <div className="h-3 w-96 mt-3 rounded bg-[color:var(--surface-elevated)]" />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
              >
                <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)]" />
                <div className="h-6 w-32 mt-2 rounded bg-[color:var(--surface-elevated)]" />
                <div className="h-3 w-24 mt-3 rounded bg-[color:var(--surface-elevated)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

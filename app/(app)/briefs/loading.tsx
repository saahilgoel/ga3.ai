export default function BriefsLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1080px] py-6 lg:py-8 animate-pulse">
        <div className="h-3 w-16 rounded bg-[color:var(--surface-elevated)]" />
        <div className="h-7 w-48 mt-2 rounded bg-[color:var(--surface-elevated)]" />
        <div className="h-3 w-80 mt-2 rounded bg-[color:var(--surface-elevated)]" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
            >
              <div className="h-7 w-7 rounded bg-[color:var(--surface-elevated)]" />
              <div className="h-5 w-2/3 rounded bg-[color:var(--surface-elevated)] mt-3" />
              <div className="h-3 w-full rounded bg-[color:var(--surface-elevated)] mt-2" />
              <div className="h-3 w-5/6 rounded bg-[color:var(--surface-elevated)] mt-1.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

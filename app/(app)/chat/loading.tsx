export default function ChatLoading() {
  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="border-b border-[color:var(--border)] px-4 lg:px-6 py-3 animate-pulse">
        <div className="h-5 w-48 rounded bg-[color:var(--surface-elevated)]" />
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-0 max-w-full lg:max-w-[760px] py-6 space-y-4 animate-pulse">
          <div className="h-3 w-72 rounded bg-[color:var(--surface-elevated)]" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-8 w-48 rounded-md bg-[color:var(--surface)] border border-[color:var(--border)]"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-[color:var(--border)] bg-[color:var(--bg)]">
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-0 max-w-full lg:max-w-[760px] py-3">
          <div className="h-10 rounded-md border border-[color:var(--border)] bg-[color:var(--surface-elevated)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

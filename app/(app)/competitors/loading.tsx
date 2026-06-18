export default function CompetitorsLoading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 max-w-[1280px] py-6 lg:py-8 animate-pulse">
        <div className="h-7 w-48 rounded bg-[color:var(--surface-elevated)] mb-3" />
        <div className="h-4 w-72 rounded bg-[color:var(--surface)] mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)]"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

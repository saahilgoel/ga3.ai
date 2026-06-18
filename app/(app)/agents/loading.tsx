export default function Loading() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="h-7 w-56 skeleton rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 skeleton rounded" />
            ))}
          </div>
          <div className="h-[440px] skeleton rounded" />
        </div>
      </div>
    </div>
  );
}

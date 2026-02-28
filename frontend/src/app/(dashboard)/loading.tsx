export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title skeleton */}
      <div className="h-8 w-48 bg-[var(--muted)] rounded-lg" />

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
            <div className="h-3 w-16 bg-[var(--muted)] rounded mb-3" />
            <div className="h-7 w-24 bg-[var(--muted)] rounded" />
          </div>
        ))}
      </div>

      {/* Content skeleton */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <div className="h-5 w-32 bg-[var(--muted)] rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-[var(--muted)] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

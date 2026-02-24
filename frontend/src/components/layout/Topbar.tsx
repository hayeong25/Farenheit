"use client";

export function Topbar() {
  return (
    <header className="h-16 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <span className="text-sm text-[var(--muted-foreground)]">
          Pipeline Status:
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm">Active</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors">
          Login
        </button>
      </div>
    </header>
  );
}

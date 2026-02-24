"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/search", label: "Search", icon: "🔍" },
  { href: "/predictions", label: "Predictions", icon: "🤖" },
  { href: "/recommendations", label: "Recommendations", icon: "🎯" },
  { href: "/alerts", label: "Alerts", icon: "🔔" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[var(--border)] bg-[var(--background)] flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-[var(--border)]">
        <Link href="/" className="text-xl font-bold">
          <span className="text-farenheit-500">Faren</span>
          <span>heit</span>
        </Link>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Flight Price Intelligence
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-farenheit-50 text-farenheit-600 font-medium"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted-foreground)] text-center">
          v0.1.0
        </p>
      </div>
    </aside>
  );
}

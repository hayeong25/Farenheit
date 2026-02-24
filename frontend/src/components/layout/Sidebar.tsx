"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: "📊" },
  { href: "/search", label: "항공편 검색", icon: "🔍" },
  { href: "/predictions", label: "가격 예측", icon: "🤖" },
  { href: "/recommendations", label: "구매 추천", icon: "🎯" },
  { href: "/alerts", label: "가격 알림", icon: "🔔" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-[var(--border)] bg-[var(--background)] flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-[var(--border)]">
          <Link href="/" className="text-xl font-bold">
            <span className="text-farenheit-500">Faren</span>
            <span>heit</span>
          </Link>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            항공권 가격 예측 시스템
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
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted-foreground)] text-center">
            v0.2.0
          </p>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--background)] border-t border-[var(--border)] flex justify-around py-2 px-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-xs transition-colors ${
                isActive
                  ? "text-farenheit-600 font-medium"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              <span aria-hidden="true" className="text-lg">{item.icon}</span>
              <span className="truncate max-w-[60px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

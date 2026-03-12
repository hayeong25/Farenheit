"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/",
    label: "홈",
    mobileLabel: "홈",
    mobileOnly: true,
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    href: "/search",
    label: "항공편 검색",
    mobileLabel: "검색",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
  },
  {
    href: "/predictions",
    label: "가격 예측",
    mobileLabel: "예측",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    href: "/recommendations",
    label: "구매 추천",
    mobileLabel: "추천",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    href: "/alerts",
    label: "가격 알림",
    mobileLabel: "알림",
    icon: (
      <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 border-r border-[var(--border)] bg-[var(--background)] flex-col">
        {/* Logo */}
        <div className="p-6">
          <Link href="/" className="text-xl font-bold">
            <span className="text-farenheit-500">Faren</span>
            <span>heit</span>
          </Link>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            항공권 가격 예측 시스템
          </p>
        </div>

        {/* Navigation */}
        <nav aria-label="메인 내비게이션" className="flex-1 p-4 space-y-1">
          {navItems.filter(item => !("mobileOnly" in item && item.mobileOnly)).map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-farenheit-50 dark:bg-farenheit-950 text-farenheit-600 dark:text-farenheit-400 font-medium"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border)]">
          <p className="text-[10px] text-[var(--muted-foreground)] text-center">
            Fare + Fahrenheit
          </p>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav aria-label="모바일 내비게이션" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--background)] border-t border-[var(--border)] flex justify-around py-2 px-1 sm:px-2 pb-safe">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 px-2 py-2 min-w-[48px] min-h-[48px] justify-center rounded-lg text-xs transition-colors ${
                isActive
                  ? "text-farenheit-600 font-medium"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              {isActive && (
                <span className="absolute -top-0.5 w-5 h-0.5 rounded-full bg-farenheit-500" />
              )}
              {item.icon}
              <span className="text-[11px]">{item.mobileLabel}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

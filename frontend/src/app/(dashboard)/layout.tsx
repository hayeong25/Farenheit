import type { Metadata } from "next";

import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: {
    template: "%s | Farenheit",
    default: "항공편 검색 | Farenheit",
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-farenheit-500 focus:text-white focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-farenheit-500 focus:ring-offset-2"
      >
        본문으로 건너뛰기
      </a>
      <Sidebar />
      <main id="main-content" className="flex-1 p-4 md:p-6 bg-[var(--muted)] pb-20 md:pb-6 overflow-x-hidden min-w-0">{children}</main>
    </div>
  );
}

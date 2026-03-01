import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "가격 알림",
};

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

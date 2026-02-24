import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farenheit - 항공권 가격 예측 시스템",
  description: "온도계처럼 항공 가격 변동을 측정하고, 최적의 구매 시기를 추천합니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}

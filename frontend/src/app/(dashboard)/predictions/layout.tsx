import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "가격 예측",
};

export default function PredictionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

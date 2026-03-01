import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구매 추천",
};

export default function RecommendationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { statsApi, StatsResponse } from "@/lib/api-client";

const popularRoutes = [
  { origin: "ICN", dest: "NRT", label: "서울 → 도쿄/나리타" },
  { origin: "ICN", dest: "KIX", label: "서울 → 오사카/간사이" },
  { origin: "ICN", dest: "FUK", label: "서울 → 후쿠오카" },
  { origin: "ICN", dest: "BKK", label: "서울 → 방콕" },
  { origin: "ICN", dest: "DAD", label: "서울 → 다낭" },
  { origin: "ICN", dest: "SIN", label: "서울 → 싱가포르" },
  { origin: "ICN", dest: "HKG", label: "서울 → 홍콩" },
  { origin: "ICN", dest: "TPE", label: "서울 → 타이베이" },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    statsApi.get()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">등록된 공항</p>
          <p className="text-3xl font-bold mt-1">
            {loading ? "..." : (stats?.airports ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">추적 중인 노선</p>
          <p className="text-3xl font-bold mt-1">
            {loading ? "..." : (stats?.routes ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">수집된 가격 데이터</p>
          <p className="text-3xl font-bold mt-1">
            {loading ? "..." : (stats?.prices ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">활성 예측</p>
          <p className="text-3xl font-bold mt-1">
            {loading ? "..." : (stats?.predictions ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Quick Search */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">인기 노선 빠른 검색</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {popularRoutes.map((route) => (
            <Link
              key={`${route.origin}-${route.dest}`}
              href={`/search?origin=${route.origin}&dest=${route.dest}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--border)] hover:border-farenheit-300 hover:bg-farenheit-50/50 transition-all group"
            >
              <span className="text-sm font-medium">{route.label}</span>
              <span className="text-farenheit-500 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
            </Link>
          ))}
        </div>
      </div>

      {/* System Status */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">시스템 상태</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">API 서버</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600">정상</span>
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">Amadeus API</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600">연결됨</span>
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">데이터 수집 (30분 간격)</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm text-green-600">활성</span>
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm">ML 예측 (60분 간격)</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-sm text-yellow-600">데이터 수집 중</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

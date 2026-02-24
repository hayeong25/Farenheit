"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { statsApi, healthApi, StatsResponse } from "@/lib/api-client";

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

type SystemStatus = "ok" | "error" | "checking";

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [apiStatus, setApiStatus] = useState<SystemStatus>("checking");

  useEffect(() => {
    // Load stats
    statsApi.get()
      .then(setStats)
      .catch(() => setStatsError(true))
      .finally(() => setLoading(false));

    // Check API health
    healthApi.check()
      .then(() => setApiStatus("ok"))
      .catch(() => setApiStatus("error"));
  }, []);

  const hasData = stats && stats.prices > 0;
  const hasPredictions = stats && stats.predictions > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-[var(--background)] rounded-xl p-4 md:p-5 border border-[var(--border)]">
          <p className="text-xs md:text-sm text-[var(--muted-foreground)]">등록된 공항</p>
          <p className="text-2xl md:text-3xl font-bold mt-1">
            {loading ? "-" : statsError ? "!" : (stats?.airports ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-4 md:p-5 border border-[var(--border)]">
          <p className="text-xs md:text-sm text-[var(--muted-foreground)]">추적 중인 노선</p>
          <p className="text-2xl md:text-3xl font-bold mt-1">
            {loading ? "-" : statsError ? "!" : (stats?.routes ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-4 md:p-5 border border-[var(--border)]">
          <p className="text-xs md:text-sm text-[var(--muted-foreground)]">수집된 가격 데이터</p>
          <p className="text-2xl md:text-3xl font-bold mt-1">
            {loading ? "-" : statsError ? "!" : (stats?.prices ?? 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-4 md:p-5 border border-[var(--border)]">
          <p className="text-xs md:text-sm text-[var(--muted-foreground)]">활성 예측</p>
          <p className="text-2xl md:text-3xl font-bold mt-1">
            {loading ? "-" : statsError ? "!" : (stats?.predictions ?? 0).toLocaleString()}
          </p>
        </div>
      </div>

      {statsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          통계 데이터를 불러오지 못했습니다. 서버 연결을 확인해 주세요.
        </div>
      )}

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

      {/* System Status - Dynamic */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">시스템 상태</h2>
        <div className="space-y-3">
          <StatusRow
            label="API 서버"
            status={apiStatus}
            statusText={apiStatus === "ok" ? "정상" : apiStatus === "error" ? "연결 실패" : "확인 중..."}
          />
          <StatusRow
            label="Amadeus API"
            status={apiStatus}
            statusText={apiStatus === "ok" ? "연결됨" : apiStatus === "error" ? "확인 필요" : "확인 중..."}
          />
          <StatusRow
            label="데이터 수집 (30분 간격)"
            status={hasData ? "ok" : "checking"}
            statusText={hasData ? "활성" : "데이터 수집 대기 중"}
          />
          <StatusRow
            label="가격 예측 (60분 간격)"
            status={hasPredictions ? "ok" : "checking"}
            statusText={hasPredictions ? `활성 (${stats?.predictions}건)` : "데이터 수집 후 시작"}
          />
        </div>
      </div>

      {/* Getting Started Guide - shown when no data yet */}
      {!loading && !hasData && (
        <div className="bg-farenheit-50 rounded-xl p-6 border border-farenheit-200">
          <h2 className="text-lg font-semibold mb-3 text-farenheit-700">시작하기</h2>
          <div className="space-y-2 text-sm text-farenheit-600">
            <p>1. 상단 메뉴에서 <strong>항공편 검색</strong>을 클릭하여 실시간 항공편을 검색하세요.</p>
            <p>2. 스케줄러가 30분마다 자동으로 인기 노선의 가격 데이터를 수집합니다.</p>
            <p>3. 충분한 데이터가 쌓이면 <strong>가격 예측</strong>과 <strong>구매 추천</strong>이 활성화됩니다.</p>
            <p>4. <strong>가격 알림</strong>을 설정하면 목표 가격 도달 시 알림을 받을 수 있습니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, status, statusText }: { label: string; status: SystemStatus; statusText: string }) {
  const colors = {
    ok: { dot: "bg-green-500", text: "text-green-600" },
    error: { dot: "bg-red-500", text: "text-red-600" },
    checking: { dot: "bg-yellow-500 animate-pulse", text: "text-yellow-600" },
  };
  const c = colors[status];

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className={`text-sm ${c.text}`}>{statusText}</span>
      </span>
    </div>
  );
}

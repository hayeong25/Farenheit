"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { statsApi, StatsResponse, alertsApi, AlertResponse, routesApi } from "@/lib/api-client";
import { getRecentSearches, formatRelativeTime, type RecentSearch } from "@/lib/utils";

interface PopularRoute {
  origin: string;
  dest: string;
  label: string;
}

const fallbackRoutes: PopularRoute[] = [
  { origin: "ICN", dest: "NRT", label: "서울 → 도쿄/나리타" },
  { origin: "ICN", dest: "KIX", label: "서울 → 오사카/간사이" },
  { origin: "ICN", dest: "FUK", label: "서울 → 후쿠오카" },
  { origin: "ICN", dest: "BKK", label: "서울 → 방콕" },
  { origin: "ICN", dest: "DAD", label: "서울 → 다낭" },
  { origin: "ICN", dest: "SIN", label: "서울 → 싱가포르" },
  { origin: "ICN", dest: "HKG", label: "서울 → 홍콩" },
  { origin: "ICN", dest: "TPE", label: "서울 → 타이베이" },
];

function getDefaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString("sv-SE");
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [popularRoutes, setPopularRoutes] = useState<PopularRoute[]>(fallbackRoutes);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    Promise.all([
      statsApi.get().then(data => {
        if (data?.error) setStatsError(true);
        return data;
      }).catch(() => { setStatsError(true); return null; }),
      alertsApi.list().catch(() => []),
      routesApi.popular(8).catch(() => null),
    ]).then(([statsData, alertsData, routesData]) => {
      if (statsData) setStats(statsData);
      setAlerts(alertsData as AlertResponse[]);
      if (routesData && Array.isArray(routesData) && routesData.length > 0) {
        const dynamicRoutes = (routesData as { origin_code: string; dest_code: string; origin_city: string | null; dest_city: string | null }[]).map(r => ({
          origin: r.origin_code,
          dest: r.dest_code,
          label: `${r.origin_city || r.origin_code} → ${r.dest_city || r.dest_code}`,
        }));
        setPopularRoutes(dynamicRoutes);
      }
    }).finally(() => setLoading(false));
    setRecentSearches(getRecentSearches());
  }, []);

  const hasData = stats && stats.prices > 0;
  const defaultDate = getDefaultDate();
  const activeAlerts = alerts.filter(a => !a.is_triggered);
  const triggeredAlerts = alerts.filter(a => a.is_triggered);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {/* Summary Cards - user-relevant */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="추적 노선"
          value={stats?.routes}
          loading={loading}
          error={statsError}
          description="가격 모니터링 중"
        />
        <StatCard
          label="수집된 가격"
          value={stats?.prices}
          loading={loading}
          error={statsError}
          description="실시간 수집 데이터"
        />
        <StatCard
          label="활성 예측"
          value={stats?.predictions}
          loading={loading}
          error={statsError}
          description="AI 분석 결과"
        />
        <StatCard
          label="가격 알림"
          value={activeAlerts.length}
          loading={loading}
          error={false}
          description={triggeredAlerts.length > 0 ? `${triggeredAlerts.length}건 도달 완료` : "모니터링 중"}
          highlight={triggeredAlerts.length > 0}
        />
      </div>

      {statsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="text-red-700 text-sm">서버에 연결할 수 없습니다.</p>
          <button
            onClick={() => window.location.reload()}
            className="shrink-0 px-4 py-1.5 rounded-lg border border-red-300 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Pipeline status */}
      {stats && (stats.last_price_collected_at || stats.last_predicted_at) && (
        <div className="flex flex-wrap gap-4 text-xs text-[var(--muted-foreground)]">
          {stats.last_price_collected_at && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              마지막 가격 수집: {formatRelativeTime(stats.last_price_collected_at)}
            </span>
          )}
          {stats.last_predicted_at && (
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              마지막 예측: {formatRelativeTime(stats.last_predicted_at)}
            </span>
          )}
        </div>
      )}

      {/* Triggered alerts notification */}
      {triggeredAlerts.length > 0 && (
        <Link
          href="/alerts"
          className="block bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            <div>
              <p className="font-medium text-green-700">
                {triggeredAlerts.length}건의 목표가 도달 알림이 있습니다
              </p>
              <p className="text-sm text-green-600 mt-0.5">클릭하여 확인하세요</p>
            </div>
          </div>
        </Link>
      )}

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold mb-4">내 최근 검색</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentSearches.slice(0, 4).map((s, i) => (
              <Link
                key={i}
                href={(() => {
                  const p = new URLSearchParams({ origin: s.origin, dest: s.dest, date: s.date });
                  if (s.returnDate) p.set("return_date", s.returnDate);
                  if (s.cabinClass !== "ECONOMY") p.set("cabin", s.cabinClass);
                  return `/search?${p.toString()}`;
                })()}
                className="flex flex-col px-4 py-3 rounded-lg border border-[var(--border)] hover:border-farenheit-300 hover:bg-farenheit-50/50 transition-all group"
              >
                <span className="text-sm font-medium">{s.originDisplay} → {s.destDisplay}</span>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {s.date}{s.returnDate ? ` ~ ${s.returnDate}` : ""}
                  </span>
                  {s.minPrice && (
                    <span className="text-xs font-medium text-farenheit-500">
                      ₩{Math.round(s.minPrice).toLocaleString()}~
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Search */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">{recentSearches.length > 0 ? "인기 노선" : "인기 노선 빠른 검색"}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {popularRoutes.map((route) => (
            <Link
              key={`${route.origin}-${route.dest}`}
              href={`/search?${new URLSearchParams({ origin: route.origin, dest: route.dest, date: defaultDate }).toString()}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--border)] hover:border-farenheit-300 hover:bg-farenheit-50/50 transition-all group"
            >
              <span className="text-sm font-medium">{route.label}</span>
              <span className="text-farenheit-500 opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Active Alerts Summary */}
      {activeAlerts.length > 0 && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">내 가격 알림</h2>
            <Link href="/alerts" className="text-sm text-farenheit-500 hover:text-farenheit-600">
              전체 보기 &rarr;
            </Link>
          </div>
          <div className="space-y-2">
            {activeAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--muted)]"
              >
                <span className="text-sm font-medium">
                  {alert.origin} → {alert.destination}
                </span>
                <span className="text-sm text-[var(--muted-foreground)]">
                  목표가 ₩{Number(alert.target_price).toLocaleString()}
                </span>
              </div>
            ))}
            {activeAlerts.length > 3 && (
              <p className="text-xs text-[var(--muted-foreground)] text-center pt-1">
                외 {activeAlerts.length - 3}건 더
              </p>
            )}
          </div>
        </div>
      )}

      {/* Getting Started Guide */}
      {!loading && !hasData && (
        <div className="bg-farenheit-50 rounded-xl p-6 border border-farenheit-200">
          <h2 className="text-lg font-semibold mb-3 text-farenheit-700">시작하기</h2>
          <div className="space-y-2 text-sm text-farenheit-600">
            <p>1. 위 인기 노선을 클릭하거나, <strong>항공편 검색</strong>에서 원하는 노선을 검색하세요.</p>
            <p>2. 검색 결과에서 <strong>가격 예측</strong>과 <strong>구매 추천</strong> 링크로 AI 분석을 확인하세요.</p>
            <p>3. <strong>가격 알림</strong>을 설정하면 목표 가격에 도달했을 때 알 수 있습니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  error,
  description,
  highlight,
}: {
  label: string;
  value?: number;
  loading: boolean;
  error: boolean;
  description?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 md:p-5 border ${
      highlight
        ? "bg-green-50 border-green-200"
        : error
          ? "bg-red-50/50 border-red-200"
          : "bg-[var(--background)] border-[var(--border)]"
    }`}>
      <p className="text-xs md:text-sm text-[var(--muted-foreground)]">{label}</p>
      <p className="text-2xl md:text-3xl font-bold mt-1">
        {loading ? (
          <span className="inline-block w-16 h-8 bg-[var(--muted)] rounded animate-pulse" />
        ) : error ? (
          <span className="text-red-400 flex items-center gap-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span className="text-lg">연결 실패</span>
          </span>
        ) : (
          (value ?? 0).toLocaleString()
        )}
      </p>
      {description && !error && (
        <p className="text-xs text-[var(--muted-foreground)] mt-1">{description}</p>
      )}
    </div>
  );
}

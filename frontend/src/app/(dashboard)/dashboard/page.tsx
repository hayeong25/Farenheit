"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { statsApi, alertsApi, type StatsResponse, type AlertResponse } from "@/lib/api-client";
import { formatRelativeTime, formatPrice } from "@/lib/utils";

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    Promise.all([
      statsApi.get().catch(() => null),
      alertsApi.list().catch(() => [] as AlertResponse[]),
    ]).then(([s, a]) => {
      setStats(s);
      setAlerts(a);
      setLoading(false);
    });
  }, []);

  const activeAlerts = alerts.filter(a => !a.is_triggered);
  const triggeredAlerts = alerts.filter(a => a.is_triggered);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
              <div className="h-3 w-16 rounded animate-shimmer mb-3" />
              <div className="h-8 w-12 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">모니터링 노선</p>
            <p className="text-3xl font-bold">{stats.routes}</p>
          </div>
          <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">수집된 가격</p>
            <p className="text-3xl font-bold">{stats.prices.toLocaleString()}</p>
          </div>
          <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">예측 데이터</p>
            <p className="text-3xl font-bold">{stats.predictions.toLocaleString()}</p>
          </div>
          <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">등록 공항</p>
            <p className="text-3xl font-bold">{stats.airports}</p>
          </div>
        </div>
      ) : null}

      {/* System Status */}
      {stats && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold mb-4">시스템 상태</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--muted)]">
              <span className={`w-2.5 h-2.5 rounded-full ${stats.last_price_collected_at ? "bg-green-500 animate-pulse-glow" : "bg-gray-400"}`} />
              <div>
                <p className="text-sm font-medium">가격 수집</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {stats.last_price_collected_at
                    ? `마지막 수집: ${formatRelativeTime(stats.last_price_collected_at)}`
                    : "아직 수집된 데이터가 없습니다"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--muted)]">
              <span className={`w-2.5 h-2.5 rounded-full ${stats.last_predicted_at ? "bg-green-500 animate-pulse-glow" : "bg-gray-400"}`} />
              <div>
                <p className="text-sm font-medium">예측 엔진</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {stats.last_predicted_at
                    ? `마지막 예측: ${formatRelativeTime(stats.last_predicted_at)}`
                    : "아직 예측이 실행되지 않았습니다"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerts Summary */}
      {!loading && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">가격 알림</h2>
            <Link
              href="/alerts"
              className="text-sm text-farenheit-500 hover:text-farenheit-600 font-medium"
            >
              전체 보기
            </Link>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] text-center py-6">
              설정된 가격 알림이 없습니다
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-yellow-50/50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500" />
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">모니터링 중</p>
                </div>
                <p className="text-2xl font-bold">{activeAlerts.length}<span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">개</span></p>
              </div>
              <div className="p-4 rounded-lg bg-green-50/50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">목표가 도달</p>
                </div>
                <p className="text-2xl font-bold">{triggeredAlerts.length}<span className="text-sm font-normal text-[var(--muted-foreground)] ml-1">개</span></p>
              </div>
            </div>
          )}

          {/* Recent triggered alerts */}
          {triggeredAlerts.length > 0 && (
            <div className="mt-4 space-y-2">
              {triggeredAlerts.slice(0, 3).map(alert => (
                <Link
                  key={alert.id}
                  href={`/search?${new URLSearchParams({ origin: alert.origin || "", dest: alert.destination || "", date: alert.departure_date || "" }).toString()}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors"
                >
                  <span className="text-sm font-medium">
                    {alert.origin} → {alert.destination}
                  </span>
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                    {formatPrice(Number(alert.target_price))} 도달
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/search"
          className="flex items-center gap-3 p-5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-farenheit-50 dark:bg-farenheit-950 flex items-center justify-center">
            <svg aria-hidden="true" className="w-5 h-5 text-farenheit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm">항공편 검색</p>
            <p className="text-xs text-[var(--muted-foreground)]">실시간 가격 비교</p>
          </div>
        </Link>
        <Link
          href="/predictions"
          className="flex items-center gap-3 p-5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-farenheit-50 dark:bg-farenheit-950 flex items-center justify-center">
            <svg aria-hidden="true" className="w-5 h-5 text-farenheit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm">가격 예측</p>
            <p className="text-xs text-[var(--muted-foreground)]">AI 가격 분석</p>
          </div>
        </Link>
        <Link
          href="/recommendations"
          className="flex items-center gap-3 p-5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 hover:shadow-sm transition-all"
        >
          <div className="w-10 h-10 rounded-full bg-farenheit-50 dark:bg-farenheit-950 flex items-center justify-center">
            <svg aria-hidden="true" className="w-5 h-5 text-farenheit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-sm">구매 추천</p>
            <p className="text-xs text-[var(--muted-foreground)]">BUY/WAIT/HOLD 분석</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" aria-busy="true" aria-label="통계 로딩 중">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
              <div className="h-3 w-16 rounded animate-shimmer mb-3" />
              <div className="h-8 w-12 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-stagger">
          {[
            { label: "모니터링 노선", value: String(stats.routes), color: "text-farenheit-500", bgColor: "bg-farenheit-50 dark:bg-farenheit-950",
              icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /> },
            { label: "수집된 가격", value: stats.prices.toLocaleString(), color: "text-green-500", bgColor: "bg-green-50 dark:bg-green-950/30",
              icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
            { label: "예측 데이터", value: stats.predictions.toLocaleString(), color: "text-blue-500", bgColor: "bg-blue-50 dark:bg-blue-950/30",
              icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /> },
            { label: "등록 공항", value: String(stats.airports), color: "text-purple-500", bgColor: "bg-purple-50 dark:bg-purple-950/30",
              icon: <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /> },
          ].map(({ label, value, color, bgColor, icon }) => (
            <div key={label} className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)] hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center`}>
                  <svg aria-hidden="true" className={`w-3.5 h-3.5 ${color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    {icon}
                  </svg>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
              </div>
              <p className="text-3xl font-bold">{value}</p>
            </div>
          ))}
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
                  href={(() => { const p = new URLSearchParams({ origin: alert.origin || "", dest: alert.destination || "", date: alert.departure_date || "" }); if (alert.cabin_class !== "ECONOMY") p.set("cabin", alert.cabin_class); return `/search?${p.toString()}`; })()}
                  className="flex items-center justify-between p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10 hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">
                      {alert.origin} → {alert.destination}
                    </span>
                    {alert.departure_date && (
                      <span className="text-xs text-[var(--muted-foreground)] ml-2">
                        {alert.departure_date.slice(5).replace("-", "/")} 출발
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-green-600 dark:text-green-400 font-medium shrink-0">
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
          className="flex items-center gap-3 p-5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 hover:shadow-sm hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-farenheit-500"
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
          className="flex items-center gap-3 p-5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 hover:shadow-sm hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-farenheit-500"
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
          className="flex items-center gap-3 p-5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 hover:shadow-sm hover:-translate-y-0.5 transition-all focus:outline-none focus:ring-2 focus:ring-farenheit-500"
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

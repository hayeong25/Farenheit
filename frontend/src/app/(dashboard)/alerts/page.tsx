"use client";

import { useState, useEffect, useCallback } from "react";
import { alertsApi, AlertResponse, routesApi } from "@/lib/api-client";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [routeId, setRouteId] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [cabinClass, setCabinClass] = useState("ECONOMY");
  const [departureDate, setDepartureDate] = useState("");
  const [creating, setCreating] = useState(false);

  const checkAuth = useCallback(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    setIsLoggedIn(!!token);
    return !!token;
  }, []);

  const loadAlerts = useCallback(async () => {
    if (!checkAuth()) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await alertsApi.list();
      setAlerts(data);
    } catch {
      setError("알림 목록을 불러오는 데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [checkAuth]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleCreate = async () => {
    if (!routeId || !targetPrice) return;
    setCreating(true);
    try {
      await alertsApi.create({
        route_id: Number(routeId),
        target_price: Number(targetPrice),
        cabin_class: cabinClass,
        departure_date: departureDate || undefined,
      });
      setShowCreate(false);
      setRouteId("");
      setTargetPrice("");
      setDepartureDate("");
      await loadAlerts();
    } catch {
      setError("알림 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await alertsApi.delete(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError("알림 삭제에 실패했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">가격 알림</h1>
        {isLoggedIn && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-farenheit-500 text-white hover:bg-farenheit-600 transition-colors"
          >
            + 알림 추가
          </button>
        )}
      </div>

      {/* How it works */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-3">알림 설정 방법</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <p className="text-2xl mb-2">1</p>
            <p className="font-medium text-sm">노선과 목표 가격 설정</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              관심 있는 노선의 목표 가격을 설정하세요
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <p className="text-2xl mb-2">2</p>
            <p className="font-medium text-sm">AI가 가격 모니터링</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              30분 간격으로 가격을 수집하고 분석합니다
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <p className="text-2xl mb-2">3</p>
            <p className="font-medium text-sm">목표가 도달 시 알림</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              목표 가격에 도달하면 즉시 알려드립니다
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Not logged in */}
      {!isLoggedIn && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <p className="text-lg mb-2">로그인이 필요합니다</p>
          <p className="text-sm">상단의 Login 버튼을 클릭하여 로그인하면 가격 알림을 설정할 수 있습니다.</p>
        </div>
      )}

      {/* Alert List */}
      {isLoggedIn && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold mb-4">
            내 알림 목록
            <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
              {alerts.length}개
            </span>
          </h2>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <p>설정된 가격 알림이 없습니다.</p>
              <p className="text-sm mt-1">위의 &quot;+ 알림 추가&quot; 버튼으로 알림을 추가하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-lg border ${
                    alert.is_triggered
                      ? "border-green-300 bg-green-50/50"
                      : "border-[var(--border)]"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">노선 #{alert.route_id}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                        {alert.cabin_class}
                      </span>
                      {alert.is_triggered ? (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                          도달 완료
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">
                          모니터링 중
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)] mt-1 flex-wrap">
                      <span>목표가: ₩{Number(alert.target_price).toLocaleString()}</span>
                      {alert.departure_date && <span>출발일: {alert.departure_date}</span>}
                      <span>생성: {formatDate(alert.created_at)}</span>
                      {alert.triggered_at && <span>도달: {formatDate(alert.triggered_at)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    className="text-sm text-red-500 hover:text-red-700 px-3 py-1 rounded border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div
            className="bg-[var(--background)] rounded-xl p-6 w-full max-w-md border border-[var(--border)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4">알림 추가</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">노선 ID</label>
                <input
                  type="number"
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  placeholder="노선 ID를 입력하세요"
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  검색 결과에서 확인할 수 있는 노선 ID를 입력하세요
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">목표 가격 (KRW)</label>
                <input
                  type="number"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder="예: 500000"
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">좌석 등급</label>
                <select
                  value={cabinClass}
                  onChange={(e) => setCabinClass(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                >
                  <option value="ECONOMY">이코노미</option>
                  <option value="PREMIUM_ECONOMY">프리미엄 이코노미</option>
                  <option value="BUSINESS">비즈니스</option>
                  <option value="FIRST">퍼스트</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">출발일 (선택)</label>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!routeId || !targetPrice || creating}
                className="flex-1 py-2.5 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50"
              >
                {creating ? "생성 중..." : "추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { alertsApi, AlertResponse, routesApi } from "@/lib/api-client";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const cabinLabels: Record<string, string> = {
  ECONOMY: "이코노미",
  PREMIUM_ECONOMY: "프리미엄 이코노미",
  BUSINESS: "비즈니스",
  FIRST: "퍼스트",
};

// Cache for resolved IATA → city names
const cityNameCache: Record<string, string> = {};

function useResolvedCityName(iataCode: string | null | undefined): string {
  const [name, setName] = useState(iataCode ? (cityNameCache[iataCode] || iataCode) : "");

  useEffect(() => {
    if (!iataCode) return;
    if (cityNameCache[iataCode]) {
      setName(cityNameCache[iataCode]);
      return;
    }
    routesApi.searchAirports(iataCode).then((airports) => {
      const match = airports.find(a => a.iata_code === iataCode);
      if (match) {
        const resolved = `${match.city_ko || match.city} (${iataCode})`;
        cityNameCache[iataCode] = resolved;
        setName(resolved);
      }
    }).catch(() => {});
  }, [iataCode]);

  return name;
}

function AlertCard({ alert, onDelete }: { alert: AlertResponse; onDelete: (id: number) => void }) {
  const originName = useResolvedCityName(alert.origin);
  const destName = useResolvedCityName(alert.destination);
  const isTriggered = alert.is_triggered;

  return (
    <div
      className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-lg border transition-colors ${
        isTriggered
          ? "border-green-300 bg-green-50/50"
          : "border-[var(--border)] hover:border-farenheit-200"
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">
            {originName} → {destName}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
            {cabinLabels[alert.cabin_class] || alert.cabin_class}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            isTriggered
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
          }`}>
            {isTriggered ? "도달 완료" : "모니터링 중"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)] mt-1 flex-wrap">
          <span>목표가: ₩{Number(alert.target_price).toLocaleString()}</span>
          {alert.departure_date && <span>출발일: {alert.departure_date}</span>}
          {isTriggered && alert.triggered_at
            ? <span>도달: {formatDate(alert.triggered_at)}</span>
            : <span>생성: {formatDate(alert.created_at)}</span>
          }
        </div>
      </div>
      <button
        onClick={() => onDelete(alert.id)}
        className="text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded border border-red-200 hover:bg-red-50 transition-colors shrink-0"
      >
        삭제
      </button>
    </div>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [cabinClass, setCabinClass] = useState("ECONOMY");
  const [departureDate, setDepartureDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await alertsApi.list();
      setAlerts(data);
    } catch {
      setError("알림 목록을 불러오는 데 실패했습니다. 서버 연결을 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleCreate = async () => {
    if (!originCode || !destCode || !targetPrice) return;
    setCreating(true);
    setCreateError(null);
    try {
      await alertsApi.create({
        origin: originCode,
        destination: destCode,
        target_price: Number(targetPrice),
        cabin_class: cabinClass,
        departure_date: departureDate || undefined,
      });
      setShowCreate(false);
      setOriginCode("");
      setDestCode("");
      setTargetPrice("");
      setDepartureDate("");
      setCabinClass("ECONOMY");
      await loadAlerts();
    } catch {
      setCreateError("알림 생성에 실패했습니다. 입력 정보를 확인해주세요.");
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

  const activeAlerts = alerts.filter((a) => !a.is_triggered);
  const triggeredAlerts = alerts.filter((a) => a.is_triggered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">가격 알림</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-lg bg-farenheit-500 text-white hover:bg-farenheit-600 transition-colors text-sm font-medium"
        >
          + 알림 추가
        </button>
      </div>

      {/* How it works - honest wording */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-3">이렇게 동작합니다</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <div className="w-8 h-8 rounded-full bg-farenheit-100 text-farenheit-600 flex items-center justify-center text-sm font-bold mb-2">1</div>
            <p className="font-medium text-sm">노선과 목표 가격 설정</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              관심 있는 노선의 목표 가격을 설정하세요
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <div className="w-8 h-8 rounded-full bg-farenheit-100 text-farenheit-600 flex items-center justify-center text-sm font-bold mb-2">2</div>
            <p className="font-medium text-sm">자동 가격 모니터링</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              30분 간격으로 가격을 수집하고 비교합니다
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <div className="w-8 h-8 rounded-full bg-farenheit-100 text-farenheit-600 flex items-center justify-center text-sm font-bold mb-2">3</div>
            <p className="font-medium text-sm">이 페이지에서 확인</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              목표 가격에 도달하면 &quot;도달 완료&quot;로 표시됩니다
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Active Alerts */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">
          모니터링 중
          <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
            {activeAlerts.length}개
          </span>
        </h2>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin" />
          </div>
        ) : activeAlerts.length === 0 ? (
          <div className="text-center py-12 text-[var(--muted-foreground)]">
            <p>모니터링 중인 가격 알림이 없습니다.</p>
            <p className="text-sm mt-1">&quot;+ 알림 추가&quot; 버튼으로 새 알림을 설정하세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>

      {/* Triggered Alerts */}
      {triggeredAlerts.length > 0 && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold mb-4">
            도달 완료
            <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
              {triggeredAlerts.length}개
            </span>
          </h2>
          <div className="space-y-3">
            {triggeredAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <div
            className="bg-[var(--background)] rounded-xl p-6 w-full max-w-lg border border-[var(--border)] shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4">가격 알림 추가</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AirportSearch
                  label="출발지"
                  placeholder="도시 또는 공항 검색"
                  value=""
                  onSelect={(code) => setOriginCode(code)}
                />
                <AirportSearch
                  label="도착지"
                  placeholder="도시 또는 공항 검색"
                  value=""
                  onSelect={(code) => setDestCode(code)}
                />
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
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  이 금액 이하가 되면 이 페이지에서 &quot;도달 완료&quot;로 표시됩니다
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              {createError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {createError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCreate(false); setCreateError(null); }}
                className="flex-1 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleCreate}
                disabled={!originCode || !destCode || !targetPrice || creating}
                className="flex-1 py-2.5 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50"
              >
                {creating ? "생성 중..." : "알림 추가"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

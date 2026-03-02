"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { alertsApi, AlertResponse, routesApi, statsApi } from "@/lib/api-client";
import { formatDate, formatPrice, formatRelativeTime, getLocalToday, getDateOneYearLater, VALID_CABIN_CLASSES, CABIN_CLASS_LABELS, SAME_ORIGIN_DEST_MSG } from "@/lib/utils";


// Cache for resolved IATA → city names (persists across re-renders)
const cityNameCache: Record<string, string> = {};

async function batchResolveCityNames(codes: string[]): Promise<Record<string, string>> {
  const unresolved = codes.filter(c => c && !cityNameCache[c]);
  const unique = [...new Set(unresolved)];
  await Promise.all(
    unique.map(code =>
      routesApi.searchAirports(code).then(airports => {
        const match = airports.find(a => a.iata_code === code);
        if (match) {
          cityNameCache[code] = `${match.city_ko || match.city} (${code})`;
        }
      }).catch(() => {})
    )
  );
  return { ...cityNameCache };
}

function AlertCard({ alert, onDelete, confirmingId, onConfirmDelete, cityNames }: {
  alert: AlertResponse;
  onDelete: (id: number) => void;
  confirmingId: number | null;
  onConfirmDelete: (id: number | null) => void;
  cityNames: Record<string, string>;
}) {
  const originName = alert.origin ? (cityNames[alert.origin] || alert.origin) : "";
  const destName = alert.destination ? (cityNames[alert.destination] || alert.destination) : "";
  const isTriggered = alert.is_triggered;

  const searchDate = alert.departure_date || getLocalToday();

  return (
    <div
      className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-lg border transition-colors ${
        isTriggered
          ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
          : "border-[var(--border)] hover:border-farenheit-200"
      }`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">
            {originName} → {destName}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
            {CABIN_CLASS_LABELS[alert.cabin_class] || alert.cabin_class}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            isTriggered
              ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
              : "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300"
          }`}>
            {isTriggered ? "목표가 도달" : "모니터링 중"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)] mt-1 flex-wrap">
          <span>목표가: {formatPrice(Number(alert.target_price))}</span>
          {alert.departure_date && <span>출발일: {alert.departure_date}</span>}
          {!alert.departure_date && <span className="text-xs italic">모든 출발일 모니터링</span>}
          {isTriggered && alert.triggered_at
            ? <span>도달: {formatDate(alert.triggered_at)}</span>
            : <span>생성: {formatDate(alert.created_at)}</span>
          }
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isTriggered && alert.origin && alert.destination && (
          <Link
            href={`/search?${new URLSearchParams({ origin: alert.origin, dest: alert.destination, date: searchDate }).toString()}`}
            className="text-sm text-white bg-farenheit-500 hover:bg-farenheit-600 px-4 py-1.5 rounded-lg font-medium transition-colors"
          >
            지금 검색
          </Link>
        )}
        {confirmingId === alert.id ? (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDelete(alert.id)}
              className="text-sm text-white bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded font-medium transition-colors"
            >
              확인
            </button>
            <button
              onClick={() => onConfirmDelete(null)}
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-3 py-1.5 rounded border border-[var(--border)] transition-colors"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => onConfirmDelete(alert.id)}
            className="text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 px-3 py-1.5 rounded border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}

function AlertsContent() {
  const searchParams = useSearchParams();
  const [alerts, setAlerts] = useState<AlertResponse[]>([]);
  const [cityNames, setCityNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastCollected, setLastCollected] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const modalRef = useRef<HTMLFormElement>(null);

  // Escape key to close modal + focus trap
  useEffect(() => {
    if (!showCreate) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowCreate(false);
        return;
      }
      // Focus trap: cycle Tab within modal
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    // Focus first input when modal opens
    const focusTimer = setTimeout(() => {
      modalRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      clearTimeout(focusTimer);
    };
  }, [showCreate]);
  const [originCode, setOriginCode] = useState(searchParams.get("origin") || "");
  const [originDisplay, setOriginDisplay] = useState(searchParams.get("origin") || "");
  const [destCode, setDestCode] = useState(searchParams.get("dest") || "");
  const [destDisplay, setDestDisplay] = useState(searchParams.get("dest") || "");
  const [targetPrice, setTargetPrice] = useState(searchParams.get("target") || "");
  const [cabinClass, setCabinClass] = useState("ECONOMY");
  const [departureDate, setDepartureDate] = useState(searchParams.get("date") || "");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Resolve IATA codes from URL to display names + auto-open modal (once only)
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    if (o) {
      routesApi.searchAirports(o).then((airports) => {
        const match = airports.find(a => a.iata_code === o);
        if (match) setOriginDisplay(`${match.city_ko || match.city} (${o})`);
      }).catch(() => {});
    }
    if (d) {
      routesApi.searchAirports(d).then((airports) => {
        const match = airports.find(a => a.iata_code === d);
        if (match) setDestDisplay(`${match.city_ko || match.city} (${d})`);
      }).catch(() => {});
    }
    if (o && d) {
      setShowCreate(true);
    }
  }, [searchParams]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await alertsApi.list();
      setAlerts(data);
      // Batch resolve all IATA codes at once
      const codes = data.flatMap(a => [a.origin, a.destination].filter((c): c is string => !!c));
      if (codes.length > 0) {
        const resolved = await batchResolveCityNames(codes);
        setCityNames(resolved);
      }
    } catch {
      setError("서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
    statsApi.get().then(s => setLastCollected(s.last_price_collected_at)).catch(() => {});
  }, [loadAlerts]);

  const handleCreate = async () => {
    if (creating) return;
    if (!originCode || !destCode || !targetPrice) return;
    if (originCode === destCode) {
      setCreateError(SAME_ORIGIN_DEST_MSG);
      return;
    }
    const priceNum = Number(targetPrice);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setCreateError("유효한 목표 가격을 입력해주세요.");
      return;
    }
    if (priceNum > 100_000_000) {
      setCreateError("목표 가격이 너무 큽니다.");
      return;
    }
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
      setOriginDisplay("");
      setDestCode("");
      setDestDisplay("");
      setTargetPrice("");
      setDepartureDate("");
      setCabinClass("ECONOMY");
      await loadAlerts();
      showToast("가격 알림이 설정되었습니다.");
    } catch (err) {
      let msg = "알림 생성에 실패했습니다. 입력 정보를 확인해주세요.";
      const apiErr = err as { data?: { detail?: string | { msg?: string }[] } };
      const detail = apiErr?.data?.detail;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        const firstMsg = detail[0]?.msg;
        if (firstMsg && typeof firstMsg === "string") {
          msg = firstMsg.replace(/^Value error, /, "");
        }
      }
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await alertsApi.delete(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm(null);
      showToast("알림이 삭제되었습니다.");
    } catch {
      setDeleteConfirm(null);
      setError("알림 삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const activeAlerts = alerts.filter((a) => !a.is_triggered);
  const triggeredAlerts = alerts.filter((a) => a.is_triggered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">가격 알림</h1>
        <button
          onClick={() => {
            setOriginCode("");
            setOriginDisplay("");
            setDestCode("");
            setDestDisplay("");
            setTargetPrice("");
            setDepartureDate("");
            setCabinClass("ECONOMY");
            setCreateError(null);
            setShowCreate(true);
          }}
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
            {lastCollected && (
              <p className="text-xs mt-2 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-green-600 dark:text-green-400 font-medium">
                  마지막 수집: {formatRelativeTime(lastCollected)}
                </span>
              </p>
            )}
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
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          <button
            onClick={loadAlerts}
            className="shrink-0 px-4 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            다시 시도
          </button>
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
              <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} confirmingId={deleteConfirm} onConfirmDelete={setDeleteConfirm} cityNames={cityNames} />
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
              <AlertCard key={alert.id} alert={alert} onDelete={handleDelete} confirmingId={deleteConfirm} onConfirmDelete={setDeleteConfirm} cityNames={cityNames} />
            ))}
          </div>
        </div>
      )}

      {/* Toast Notification - always present in DOM for screen reader announcements */}
      <div role="status" aria-live="polite" className={`fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-lg bg-[var(--foreground)] text-[var(--background)] text-sm font-medium shadow-lg transition-opacity duration-200 ${toast ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {toast || ""}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreate(false)}>
          <form
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-alert-title"
            className="bg-[var(--background)] rounded-xl p-6 w-full max-w-lg border border-[var(--border)] shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
          >
            <h2 id="create-alert-title" className="text-xl font-bold mb-4">가격 알림 추가</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <AirportSearch
                  label="출발지"
                  placeholder="도시 또는 공항 검색"
                  value={originDisplay}
                  onSelect={(code, display) => { setOriginCode(code); setOriginDisplay(display || ""); setCreateError(null); }}
                />
                <AirportSearch
                  label="도착지"
                  placeholder="도시 또는 공항 검색"
                  value={destDisplay}
                  onSelect={(code, display) => { setDestCode(code); setDestDisplay(display || ""); setCreateError(null); }}
                />
              </div>
              <div>
                <label htmlFor="alert-target-price" className="block text-sm font-medium mb-1">목표 가격 (KRW)</label>
                <input
                  id="alert-target-price"
                  type="number"
                  min="1"
                  max="100000000"
                  step="1000"
                  value={targetPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Prevent absurdly long inputs
                    if (val.length > 12) return;
                    setTargetPrice(val);
                  }}
                  placeholder="예: 500000"
                  className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  이 금액 이하가 되면 이 페이지에서 &quot;도달 완료&quot;로 표시됩니다
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="alert-cabin-class" className="block text-sm font-medium mb-1">좌석 등급</label>
                  <select
                    id="alert-cabin-class"
                    value={cabinClass}
                    onChange={(e) => setCabinClass(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                  >
                    {VALID_CABIN_CLASSES.map((c) => (
                      <option key={c} value={c}>{CABIN_CLASS_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="alert-departure-date" className="block text-sm font-medium mb-1">출발일 (선택)</label>
                  <input
                    id="alert-departure-date"
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    min={getLocalToday()}
                    max={getDateOneYearLater()}
                    className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    비워두면 이 노선의 모든 출발일 가격을 모니터링합니다
                  </p>
                </div>
              </div>
              {createError && (
                <div role="alert" className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                  {createError}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(null); }}
                className="flex-1 py-2.5 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!originCode || !destCode || !targetPrice || creating}
                className="flex-1 py-2.5 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50"
              >
                {creating ? "생성 중..." : "알림 추가"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 w-28 bg-[var(--muted)] rounded animate-pulse" />
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-16 bg-[var(--muted)] rounded-lg animate-pulse" />)}
          </div>
        </div>
      </div>
    }>
      <AlertsContent />
    </Suspense>
  );
}

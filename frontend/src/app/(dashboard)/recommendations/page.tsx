"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { recommendationsApi, routesApi, type RecommendationResponse } from "@/lib/api-client";
import { getLocalToday, getDateOneYearLater, formatPrice, getMissingFieldsMsg, VALID_CABIN_CLASSES, CABIN_CLASS_LABELS, SAME_ORIGIN_DEST_MSG, NETWORK_ERROR_MSG } from "@/lib/utils";

const signalConfig: Record<string, { color: string; bgColor: string; label: string; description: string; icon: string }> = {
  BUY: {
    color: "text-green-700 dark:text-green-300",
    bgColor: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
    label: "BUY",
    description: "지금이 구매 적기입니다",
    icon: "✓",
  },
  WAIT: {
    color: "text-yellow-700 dark:text-yellow-300",
    bgColor: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800",
    label: "WAIT",
    description: "가격 하락이 예상됩니다. 대기하세요",
    icon: "⏳",
  },
  HOLD: {
    color: "text-gray-700 dark:text-gray-300",
    bgColor: "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700",
    label: "HOLD",
    description: "시장이 불안정합니다. 관망하세요",
    icon: "⏸",
  },
  INSUFFICIENT: {
    color: "text-blue-700 dark:text-blue-300",
    bgColor: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    label: "데이터 부족",
    description: "아직 분석할 데이터가 없습니다",
    icon: "ℹ",
  },
};

function RecommendationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [originCode, setOriginCode] = useState(searchParams.get("origin") || "");
  const [originDisplay, setOriginDisplay] = useState("");
  const [destCode, setDestCode] = useState(searchParams.get("dest") || "");
  const [destDisplay, setDestDisplay] = useState("");
  const [date, setDate] = useState(searchParams.get("date") || "");
  const cabinParam = searchParams.get("cabin") || "ECONOMY";
  const [cabinClass, setCabinClass] = useState((VALID_CABIN_CLASSES as readonly string[]).includes(cabinParam) ? cabinParam : "ECONOMY");
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const originKeyRef = useRef(0);
  const destKeyRef = useRef(0);

  // Resolve IATA codes to display names on mount (once only)
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    if (o) {
      routesApi.searchAirports(o).then((airports) => {
        const match = airports.find(a => a.iata_code === o);
        if (match) {
          setOriginDisplay(`${(match.city_ko || match.city)} (${o})`);
          originKeyRef.current += 1;
        } else {
          setOriginDisplay(o);
        }
      }).catch(() => setOriginDisplay(o));
    }
    if (d) {
      routesApi.searchAirports(d).then((airports) => {
        const match = airports.find(a => a.iata_code === d);
        if (match) {
          setDestDisplay(`${(match.city_ko || match.city)} (${d})`);
          destKeyRef.current += 1;
        } else {
          setDestDisplay(d);
        }
      }).catch(() => setDestDisplay(d));
    }
  }, [searchParams]);

  const [validationMsg, setValidationMsg] = useState("");

  const handleGetRecommendation = useCallback(async (origin: string, dest: string, depDate: string) => {
    if (!origin || !dest || !depDate) return;
    if (origin === dest) {
      setValidationMsg(SAME_ORIGIN_DEST_MSG);
      return;
    }
    setValidationMsg("");
    setLoading(true);
    setSearched(true);
    setError(null);

    const currentRequestId = ++requestIdRef.current;

    const urlParams = new URLSearchParams({ origin, dest, date: depDate });
    if (cabinClass !== "ECONOMY") urlParams.set("cabin", cabinClass);
    router.replace(`/recommendations?${urlParams.toString()}`, { scroll: false });
    try {
      const result = await recommendationsApi.get({
        origin,
        dest,
        departure_date: depDate,
        cabin_class: cabinClass,
      });
      if (currentRequestId !== requestIdRef.current) return;
      setRecommendation(result);
    } catch {
      if (currentRequestId !== requestIdRef.current) return;
      setError(NETWORK_ERROR_MSG);
      setRecommendation(null);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [router, cabinClass]);

  // Auto-search on mount if URL params present (once only)
  const autoSearchedRef = useRef(false);
  useEffect(() => {
    if (autoSearchedRef.current) return;
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    const dt = searchParams.get("date");
    if (o && d && dt && !searched) {
      autoSearchedRef.current = true;
      handleGetRecommendation(o, d, dt);
    }
  }, [searchParams, searched, handleGetRecommendation]);

  // Re-search when cabin class changes (skip on initial mount)
  const cabinInitialRef = useRef(true);
  useEffect(() => {
    if (cabinInitialRef.current) {
      cabinInitialRef.current = false;
      return;
    }
    if (searched && originCode && destCode && date) {
      handleGetRecommendation(originCode, destCode, date);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinClass]);

  const handleSwap = () => {
    const tc = originCode, td = originDisplay;
    setOriginCode(destCode); setOriginDisplay(destDisplay);
    setDestCode(tc); setDestDisplay(td);
    originKeyRef.current += 1;
    destKeyRef.current += 1;
  };

  const isInsufficient = recommendation?.signal === "INSUFFICIENT";
  const signal = recommendation && !isInsufficient ? signalConfig[recommendation.signal] || signalConfig.HOLD : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">구매 추천</h1>

      {/* Signal Legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        {Object.entries(signalConfig).map(([key, cfg]) => {
          const dotColor = key === "BUY" ? "bg-green-500" :
            key === "WAIT" ? "bg-yellow-500" :
            key === "HOLD" ? "bg-gray-400" : "bg-blue-400";
          const borderStyle = key === "INSUFFICIENT" ? "border-dashed border-[var(--border)]" : "border-[var(--border)]";
          const isActive = recommendation?.signal === key;
          return (
            <div key={key} className={`bg-[var(--background)] rounded-xl p-4 border transition-all hover:shadow-sm ${borderStyle} ${
              isActive ? "ring-2 ring-farenheit-500 shadow-sm" : ""
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor} ${isActive ? "animate-pulse-glow" : ""}`} />
                <span className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">{cfg.description}</p>
            </div>
          );
        })}
      </div>

      {/* Query Form */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] lg:grid-cols-[1fr_auto_1fr_1fr_1fr_auto] gap-4 items-end">
          <AirportSearch
            key={`ro-${originKeyRef.current}`}
            label="출발지"
            placeholder="출발 도시"
            value={originDisplay}
            onSelect={(code, display) => { setOriginCode(code); setOriginDisplay(display || ""); }}
          />
          <div className="hidden md:flex items-end pb-1">
            <button
              onClick={handleSwap}
              disabled={!originCode || !destCode}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] hover:bg-farenheit-50 dark:hover:bg-farenheit-950 hover:border-farenheit-300 transition-colors disabled:opacity-30"
              title="출발지/도착지 바꾸기"
              aria-label="출발지와 도착지 바꾸기"
            >
              <svg aria-hidden="true" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <AirportSearch
            key={`rd-${destKeyRef.current}`}
            label="도착지"
            placeholder="도착 도시"
            value={destDisplay}
            onSelect={(code, display) => { setDestCode(code); setDestDisplay(display || ""); }}
          />
          <div>
            <label htmlFor="rec-departure-date" className="block text-sm font-medium mb-1">출발일</label>
            <input
              id="rec-departure-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={getLocalToday()}
              max={getDateOneYearLater()}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div>
            <label htmlFor="rec-cabin-class" className="block text-sm font-medium mb-1">좌석 등급</label>
            <select
              id="rec-cabin-class"
              value={cabinClass}
              onChange={(e) => setCabinClass(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            >
              {VALID_CABIN_CLASSES.map((c) => (
                <option key={c} value={c}>{CABIN_CLASS_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                const missingMsg = getMissingFieldsMsg(originCode, destCode, date);
                if (missingMsg) {
                  setValidationMsg(missingMsg);
                  return;
                }
                if (originCode === destCode) {
                  setValidationMsg(SAME_ORIGIN_DEST_MSG);
                  return;
                }
                setValidationMsg("");
                handleGetRecommendation(originCode, destCode, date);
              }}
              disabled={!originCode || !destCode || !date || loading}
              className="w-full py-3 px-6 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? "분석 중..." : "추천 받기"}
            </button>
          </div>
        </div>

        {/* Mobile swap */}
        <button
          onClick={handleSwap}
          disabled={!originCode || !destCode}
          className="md:hidden w-full mt-2 py-2 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] hover:bg-farenheit-50 dark:hover:bg-farenheit-950 transition-colors disabled:opacity-30 text-sm text-[var(--muted-foreground)]"
        >
          <svg aria-hidden="true" className="w-4 h-4 rotate-90 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          출발지/도착지 바꾸기
        </button>
        {validationMsg && (
          <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-2">{validationMsg}</p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          <button
            onClick={() => handleGetRecommendation(originCode, destCode, date)}
            className="shrink-0 px-4 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Result */}
      {loading && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-10 w-20 rounded animate-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded animate-shimmer" />
              <div className="h-3 w-56 rounded animate-shimmer" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-16 rounded animate-shimmer" />
                <div className="h-6 w-24 rounded animate-shimmer" />
              </div>
            ))}
          </div>
          <div className="h-20 w-full rounded-lg animate-shimmer" />
          <p className="text-center text-sm text-[var(--muted-foreground)] mt-4">AI가 최적 구매 타이밍을 분석하고 있습니다...</p>
        </div>
      )}

      {!loading && searched && recommendation && signal && (
        <div className={`rounded-xl p-6 border-2 animate-fade-in-up ${signal.bgColor}`} aria-live="polite">
          <div className="flex items-center gap-4 mb-4">
            <span className={`text-2xl sm:text-3xl md:text-4xl font-black ${signal.color}`}>
              {signal.label}
            </span>
            <div>
              <p className={`font-semibold ${signal.color}`}>{signal.description}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {originDisplay || recommendation.origin} → {destDisplay || recommendation.destination} | {recommendation.departure_date}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 mb-4">
            {recommendation.current_price != null && Number.isFinite(Number(recommendation.current_price)) && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">현재 예측 가격</p>
                <p className="text-lg font-bold">{formatPrice(Number(recommendation.current_price))}</p>
              </div>
            )}
            {recommendation.predicted_low != null && Number.isFinite(Number(recommendation.predicted_low)) && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">예측 최저가</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatPrice(Number(recommendation.predicted_low))}</p>
              </div>
            )}
            {recommendation.best_airline && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">추천 항공사</p>
                <p className="text-lg font-bold">{recommendation.best_airline}</p>
              </div>
            )}
            {recommendation.confidence != null && Number.isFinite(recommendation.confidence) && recommendation.confidence > 0 && (() => {
              const pct = Math.round(recommendation.confidence * 100);
              const label = pct >= 85 ? "높음" : pct >= 60 ? "보통" : "낮음";
              const color = pct >= 85 ? "text-green-600 dark:text-green-400" : pct >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
              return (
                <div>
                  <p className="text-xs text-[var(--muted-foreground)]">신뢰도</p>
                  <p className="text-lg font-bold">{pct}% <span className={`text-sm font-medium ${color}`}>({label})</span></p>
                </div>
              );
            })()}
          </div>

          {recommendation.signal === "WAIT" && recommendation.predicted_low_date && typeof recommendation.predicted_low_date === "string" && recommendation.predicted_low_date.length >= 10 && (
            <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    예상 최저가 시점: {(() => {
                      const d = new Date(recommendation.predicted_low_date + "T00:00:00");
                      return isNaN(d.getTime()) ? recommendation.predicted_low_date : d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
                    })()}경
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">이 시점까지 대기하면 더 저렴한 가격을 기대할 수 있습니다.</p>
                </div>
                {recommendation.predicted_low && (
                  <Link
                    href={`/alerts?${new URLSearchParams({ origin: recommendation.origin, dest: recommendation.destination, target: String(Math.round(recommendation.predicted_low)), date: recommendation.departure_date }).toString()}`}
                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-yellow-600 text-white text-sm font-medium hover:bg-yellow-700 transition-colors"
                  >
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                    가격 알림 설정
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg bg-[var(--muted)] mt-4">
            <div className="flex items-center gap-2 mb-1.5">
              <svg aria-hidden="true" className="w-4 h-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              <p className="text-sm font-medium">AI 분석 근거</p>
            </div>
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{recommendation.reasoning}</p>
          </div>

          {/* Quick action links */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Link
              href={(() => {
                const p = new URLSearchParams({ origin: recommendation.origin, dest: recommendation.destination, date: recommendation.departure_date });
                if (cabinClass !== "ECONOMY") p.set("cabin", cabinClass);
                return `/search?${p.toString()}`;
              })()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)] transition-colors"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              항공편 검색
            </Link>
            <Link
              href={(() => {
                const p = new URLSearchParams({ origin: recommendation.origin, dest: recommendation.destination, date: recommendation.departure_date });
                if (cabinClass !== "ECONOMY") p.set("cabin", cabinClass);
                return `/predictions?${p.toString()}`;
              })()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)] transition-colors"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
              가격 예측 보기
            </Link>
          </div>
        </div>
      )}

      {!loading && searched && (!recommendation || isInsufficient) && !error && (
        <div className="rounded-xl p-8 border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <svg aria-hidden="true" className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </div>
          <p className="font-semibold text-blue-800 dark:text-blue-200">아직 분석할 가격 데이터가 부족합니다</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            {isInsufficient && recommendation?.reasoning
              ? recommendation.reasoning
              : "이 노선의 가격 데이터가 충분히 수집되지 않아 추천을 생성할 수 없습니다."}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">먼저 항공편을 검색하면 가격 수집이 시작되고, 약 1시간 후 AI 분석이 가능합니다.</p>
          <Link
            href={originCode && destCode && date
              ? `/search?${new URLSearchParams({ origin: originCode, dest: destCode, date }).toString()}`
              : "/search"}
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-lg bg-blue-600 dark:bg-blue-700 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            항공편 검색하러 가기
          </Link>
        </div>
      )}

      {/* Initial State */}
      {!searched && !loading && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <svg aria-hidden="true" className="w-12 h-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
          </svg>
          <p className="text-lg mb-2">출발지, 도착지, 출발일을 입력하세요</p>
          <p className="text-sm">AI가 지금 구매할지, 기다릴지 분석해드립니다</p>
        </div>
      )}
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 w-28 bg-[var(--muted)] rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-[var(--muted)] rounded-xl animate-pulse" />)}
        </div>
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-lg animate-pulse" />)}
          </div>
        </div>
      </div>
    }>
      <RecommendationsContent />
    </Suspense>
  );
}

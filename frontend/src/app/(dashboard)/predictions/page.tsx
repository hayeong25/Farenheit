"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { predictionsApi, routesApi, type PredictionResponse, type HeatmapResponse } from "@/lib/api-client";
import { getLocalToday, getDateOneYearLater, formatPrice, getMissingFieldsMsg, VALID_CABIN_CLASSES, CABIN_CLASS_LABELS, SAME_ORIGIN_DEST_MSG, NETWORK_ERROR_MSG } from "@/lib/utils";

function PredictionsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [originCode, setOriginCode] = useState(searchParams.get("origin") || "");
  const [originDisplay, setOriginDisplay] = useState("");
  const [destCode, setDestCode] = useState(searchParams.get("dest") || "");
  const [destDisplay, setDestDisplay] = useState("");
  const [date, setDate] = useState(searchParams.get("date") || "");
  const cabinParam = searchParams.get("cabin") || "ECONOMY";
  const [cabinClass, setCabinClass] = useState((VALID_CABIN_CLASSES as readonly string[]).includes(cabinParam) ? cabinParam : "ECONOMY");
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Heatmap uses same origin/dest, auto-derives month from date
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapMonth, setHeatmapMonth] = useState("");
  const requestIdRef = useRef(0);
  const heatmapIdRef = useRef(0);

  // Swap refs
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

  const loadHeatmap = useCallback(async (origin: string, dest: string, month: string) => {
    if (!origin || !dest || !month || month.length < 7) return;
    const currentId = ++heatmapIdRef.current;
    setHeatmapLoading(true);
    setHeatmapMonth(month);
    try {
      const hm = await predictionsApi.heatmap({ origin, dest, month, cabin_class: cabinClass });
      if (currentId !== heatmapIdRef.current) return;
      setHeatmap(hm);
    } catch {
      if (currentId !== heatmapIdRef.current) return;
      setHeatmap(null);
    } finally {
      if (currentId === heatmapIdRef.current) {
        setHeatmapLoading(false);
      }
    }
  }, [cabinClass]);

  const handlePredict = useCallback(async (origin: string, dest: string, depDate: string) => {
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

    // Update URL
    const urlParams = new URLSearchParams({ origin, dest, date: depDate });
    if (cabinClass !== "ECONOMY") urlParams.set("cabin", cabinClass);
    router.replace(`/predictions?${urlParams.toString()}`, { scroll: false });

    try {
      const result = await predictionsApi.get({
        origin,
        dest,
        departure_date: depDate,
        cabin_class: cabinClass,
      });
      if (currentRequestId !== requestIdRef.current) return;
      setPrediction(result);
    } catch {
      if (currentRequestId !== requestIdRef.current) return;
      setError(NETWORK_ERROR_MSG);
      setPrediction(null);
      setLoading(false);
      return; // Skip heatmap on prediction failure
    }
    setLoading(false);

    // Auto-load heatmap for the same month (only if prediction succeeded)
    loadHeatmap(origin, dest, depDate.slice(0, 7));
  }, [router, cabinClass, loadHeatmap]);

  // Auto-search on mount if URL params present (once only)
  const autoSearchedRef = useRef(false);
  useEffect(() => {
    if (autoSearchedRef.current) return;
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    const dt = searchParams.get("date");
    if (o && d && dt && !searched) {
      autoSearchedRef.current = true;
      handlePredict(o, d, dt);
    }
  }, [searchParams, searched, handlePredict]);

  // Re-search when cabin class changes (skip on initial mount)
  const cabinInitialRef = useRef(true);
  useEffect(() => {
    if (cabinInitialRef.current) {
      cabinInitialRef.current = false;
      return;
    }
    if (searched && originCode && destCode && date) {
      handlePredict(originCode, destCode, date);
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

  const hasPredictionData = prediction && prediction.predicted_price !== null && prediction.model_version !== "none";

  // Helpers for prediction result visualization
  const predLow = prediction?.confidence_low != null ? Number(prediction.confidence_low) : null;
  const predHigh = prediction?.confidence_high != null ? Number(prediction.confidence_high) : null;
  const predPrice = prediction?.predicted_price != null ? Number(prediction.predicted_price) : null;
  const confScore = prediction?.confidence_score != null ? Number(prediction.confidence_score) : null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">가격 예측</h1>

      {/* Search Form */}
      <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] lg:grid-cols-[1fr_auto_1fr_1fr_1fr_auto] gap-3 items-end">
          <AirportSearch
            key={`po-${originKeyRef.current}`}
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
            key={`pd-${destKeyRef.current}`}
            label="도착지"
            placeholder="도착 도시"
            value={destDisplay}
            onSelect={(code, display) => { setDestCode(code); setDestDisplay(display || ""); }}
          />
          <div>
            <label htmlFor="pred-departure-date" className="block text-sm font-medium mb-1">출발일</label>
            <input
              id="pred-departure-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={getLocalToday()}
              max={getDateOneYearLater()}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div>
            <label htmlFor="pred-cabin-class" className="block text-sm font-medium mb-1">좌석 등급</label>
            <select
              id="pred-cabin-class"
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
                handlePredict(originCode, destCode, date);
              }}
              disabled={!originCode || !destCode || !date || loading}
              className="w-full py-3 px-6 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? "분석 중..." : "예측 조회"}
            </button>
          </div>
        </div>
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
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 flex items-center justify-between gap-3">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          <button
            onClick={() => handlePredict(originCode, destCode, date)}
            className="shrink-0 px-4 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-[var(--background)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-6 pt-6 pb-4 text-center space-y-3">
            <div className="h-3 w-16 mx-auto rounded animate-shimmer" />
            <div className="h-10 w-40 mx-auto rounded animate-shimmer" />
            <div className="h-4 w-28 mx-auto rounded animate-shimmer" />
          </div>
          <div className="px-6 pb-5">
            <div className="h-2 w-full rounded-full animate-shimmer" />
          </div>
          <div className="px-6 pb-5 flex items-center gap-3">
            <div className="h-3 w-10 rounded animate-shimmer" />
            <div className="flex-1 h-1.5 rounded-full animate-shimmer" />
            <div className="h-3 w-8 rounded animate-shimmer" />
          </div>
          <p className="text-center text-sm text-[var(--muted-foreground)] pb-6">가격 추세를 분석하고 있습니다...</p>
        </div>
      )}

      {/* Prediction Result - Redesigned */}
      {searched && !loading && hasPredictionData && (
        <div className="bg-[var(--background)] rounded-xl border border-[var(--border)] overflow-hidden animate-fade-in-up" aria-live="polite">
          {/* Main price */}
          <div className="px-6 pt-6 pb-4 text-center">
            <p className="text-xs text-[var(--muted-foreground)] mb-1">예측 가격</p>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight">{formatPrice(predPrice!)}</p>
            {prediction.price_direction && prediction.price_direction !== "STABLE" && (
              <p className={`text-sm font-medium mt-1 ${
                prediction.price_direction === "DOWN" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
              }`}>
                {prediction.price_direction === "DOWN" ? "↓ 가격 하락 예상" : "↑ 가격 상승 예상"}
              </p>
            )}
            {prediction.price_direction === "STABLE" && (
              <p className="text-sm font-medium mt-1 text-[var(--muted-foreground)]">→ 가격 유지 예상</p>
            )}
          </div>

          {/* Range bar */}
          {predLow != null && predHigh != null && Number.isFinite(predLow) && Number.isFinite(predHigh) && predHigh > predLow && (
            <div className="px-6 pb-5">
              <div className="relative">
                <div className="flex justify-between text-xs text-[var(--muted-foreground)] mb-1.5">
                  <span>{formatPrice(predLow)}</span>
                  <span>{formatPrice(predHigh)}</span>
                </div>
                <div className="relative h-2 rounded-full bg-gradient-to-r from-green-400/30 via-yellow-300/30 to-red-400/30 dark:from-green-400/20 dark:via-yellow-300/20 dark:to-red-400/20">
                  <div className="absolute h-2 rounded-full bg-gradient-to-r from-green-400 via-yellow-300 to-red-400 opacity-60" style={{ left: 0, right: 0 }} />
                  {/* Predicted price marker */}
                  {predPrice != null && (() => {
                    const pct = Math.min(Math.max(((predPrice - predLow) / (predHigh - predLow)) * 100, 2), 98);
                    return (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[var(--background)] border-[2.5px] border-farenheit-500 shadow-sm"
                        style={{ left: `${pct}%`, marginLeft: "-7px" }}
                      />
                    );
                  })()}
                </div>
                <div className="flex justify-between text-[10px] text-[var(--muted-foreground)] mt-1">
                  <span>하한</span>
                  <span>상한</span>
                </div>
              </div>
            </div>
          )}

          {/* Confidence */}
          {confScore != null && Number.isFinite(confScore) && (
            <div className="px-6 pb-5 flex items-center gap-3">
              <span className="text-xs text-[var(--muted-foreground)] shrink-0">신뢰도</span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--muted)]">
                <div
                  className={`h-full rounded-full transition-all ${
                    confScore >= 0.85 ? "bg-green-500" : confScore >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.round(confScore * 100)}%` }}
                />
              </div>
              <span className={`text-xs font-medium tabular-nums ${
                confScore >= 0.85 ? "text-green-600 dark:text-green-400" : confScore >= 0.6 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
              }`}>
                {Math.round(confScore * 100)}%
              </span>
            </div>
          )}

          {/* Forecast Series Chart */}
          {prediction.forecast_series && prediction.forecast_series.length > 1 && (() => {
            const series = prediction.forecast_series;
            const prices = series.map(f => f.predicted_price).filter(p => Number.isFinite(p) && p > 0);
            const lows = series.map(f => f.confidence_low).filter(p => Number.isFinite(p) && p > 0);
            const highs = series.map(f => f.confidence_high).filter(p => Number.isFinite(p) && p > 0);
            if (prices.length < 2) return null;
            const allVals = [...prices, ...lows, ...highs];
            const minV = Math.min(...allVals);
            const maxV = Math.max(...allVals);
            const range = maxV - minV || 1;
            const W = 600;
            const H = 120;
            const pad = { t: 10, b: 20, l: 0, r: 0 };
            const cw = W - pad.l - pad.r;
            const ch = H - pad.t - pad.b;
            const toX = (i: number) => pad.l + (i / (series.length - 1)) * cw;
            const toY = (v: number) => pad.t + (1 - (v - minV) / range) * ch;

            const mainLine = series.map((f, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(f.predicted_price).toFixed(1)}`).join(" ");
            const bandTop = series.map((f, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(f.confidence_high).toFixed(1)}`).join(" ");
            const bandBot = [...series].reverse().map((f, i) => `L${toX(series.length - 1 - i).toFixed(1)},${toY(f.confidence_low).toFixed(1)}`).join(" ");

            // Label dates: show first, middle, last
            const labelIdxs = [0, Math.floor(series.length / 2), series.length - 1];
            const formatShortDate = (d: string) => {
              const parts = d.split("-");
              return parts.length >= 3 ? `${Number(parts[1])}/${Number(parts[2])}` : d;
            };

            // Find index of current selected date for highlight
            const selectedIdx = series.findIndex(f => f.date === date);

            return (
              <div className="px-6 pb-5">
                <p className="text-xs text-[var(--muted-foreground)] mb-2">가격 예측 추이</p>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" aria-label="가격 예측 추이 차트">
                  {/* Confidence band */}
                  <path d={`${bandTop} ${bandBot} Z`} className="fill-farenheit-200 dark:fill-farenheit-800 opacity-30 dark:opacity-40" />
                  {/* Main line */}
                  <path d={mainLine} fill="none" className="stroke-farenheit-500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Selected date indicator */}
                  {selectedIdx >= 0 && (
                    <>
                      <line
                        x1={toX(selectedIdx)} y1={pad.t}
                        x2={toX(selectedIdx)} y2={H - pad.b}
                        className="stroke-farenheit-400 dark:stroke-farenheit-600" strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
                      />
                      <circle
                        cx={toX(selectedIdx)}
                        cy={toY(series[selectedIdx].predicted_price)}
                        r="4"
                        className="fill-farenheit-500 stroke-[var(--background)]"
                        strokeWidth="2"
                      />
                    </>
                  )}
                  {/* Date labels */}
                  {labelIdxs.map(i => (
                    <text key={i} x={toX(i)} y={H - 2} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} className="fill-[var(--muted-foreground)]" fontSize="9">{formatShortDate(series[i].date)}</text>
                  ))}
                  {/* Price labels: min and max */}
                  <text x={W - 2} y={toY(maxV) + 3} textAnchor="end" className="fill-[var(--muted-foreground)]" fontSize="9">{formatPrice(Math.round(maxV))}</text>
                  <text x={W - 2} y={toY(minV) - 2} textAnchor="end" className="fill-[var(--muted-foreground)]" fontSize="9">{formatPrice(Math.round(minV))}</text>
                </svg>
              </div>
            );
          })()}

          {/* Quick action links */}
          <div className="px-6 pb-5 flex items-center gap-3 flex-wrap">
            <Link
              href={`/search?${new URLSearchParams({ origin: originCode, dest: destCode, date }).toString()}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)] transition-colors"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              항공편 검색
            </Link>
            <Link
              href={`/recommendations?${new URLSearchParams({ origin: originCode, dest: destCode, date }).toString()}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)] transition-colors"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              구매 추천
            </Link>
          </div>
        </div>
      )}

      {/* No prediction data */}
      {searched && !loading && !error && !hasPredictionData && (
        <div className="rounded-xl p-8 border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 text-center">
          <p className="font-medium text-blue-800 dark:text-blue-200">이 노선의 가격 데이터를 수집 중입니다</p>
          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1.5">
            먼저 항공편을 검색하면 약 1시간 후 예측이 생성됩니다.
          </p>
          <Link
            href={originCode && destCode && date
              ? `/search?${new URLSearchParams({ origin: originCode, dest: destCode, date }).toString()}`
              : "/search"}
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            항공편 검색
          </Link>
        </div>
      )}

      {/* Heatmap - Calendar Style */}
      {searched && !loading && !error && (
        <div className="bg-[var(--background)] rounded-xl border border-[var(--border)] overflow-hidden">
          {/* Calendar header */}
          {!heatmapLoading && heatmap && heatmap.cells.length > 0 && (() => {
            const firstDate = new Date(heatmap.cells[0].departure_date + "T00:00:00");
            const yr = firstDate.getFullYear();
            const mo = firstDate.getMonth(); // 0-indexed
            const prevMonth = mo === 0 ? `${yr - 1}-12` : `${yr}-${String(mo).padStart(2, "0")}`;
            const nextMonth = mo === 11 ? `${yr + 1}-01` : `${yr}-${String(mo + 2).padStart(2, "0")}`;
            const today = getLocalToday();
            const todayMonth = today.slice(0, 7);
            const canPrev = prevMonth >= todayMonth;
            return (
              <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => canPrev && loadHeatmap(originCode, destCode, prevMonth)}
                    disabled={!canPrev}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--muted)] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                    aria-label="이전 달"
                  >
                    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <h2 className="text-sm font-semibold min-w-[80px] text-center">
                    {yr}년 {mo + 1}월
                  </h2>
                  <button
                    onClick={() => loadHeatmap(originCode, destCode, nextMonth)}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--muted)] transition-colors"
                    aria-label="다음 달"
                  >
                    <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]">
                  <span className="w-2 h-2 rounded-sm bg-green-500/25" />
                  <span>저렴</span>
                  <span className="w-2 h-2 rounded-sm bg-red-500/25 ml-1" />
                  <span>비쌈</span>
                </div>
              </div>
            );
          })()}
          {(heatmapLoading || !heatmap || heatmap.cells.length === 0) && (
            <div className="px-4 py-2.5 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold">월간 가격 히트맵</h2>
            </div>
          )}

          <div className="p-2.5">
            {heatmapLoading && (
              <div>
                <div className="grid grid-cols-7">
                  {["일","월","화","수","목","금","토"].map(d => (
                    <div key={d} className="py-1 text-center text-[10px] font-medium text-[var(--muted-foreground)]">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-[1px] bg-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <div key={i} className="bg-[var(--background)] h-10">
                      <div className="p-1"><div className="h-2 w-3 rounded animate-shimmer" /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!heatmapLoading && heatmap && heatmap.cells.length > 0 && (() => {
              const cellMap = new Map(heatmap.cells.map(c => [c.departure_date, c]));
              const prices = heatmap.cells.map(c => c.predicted_price).filter(p => Number.isFinite(p) && p > 0);
              const minP = Math.min(...prices);
              const maxP = Math.max(...prices);
              const range = maxP - minP || 1;

              const firstDate = new Date(heatmap.cells[0].departure_date + "T00:00:00");
              const year = firstDate.getFullYear();
              const month = firstDate.getMonth();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const firstDow = new Date(year, month, 1).getDay();

              const weeks: (typeof heatmap.cells[0] | null)[][] = [];
              let week: (typeof heatmap.cells[0] | null)[] = Array(firstDow).fill(null);
              for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                week.push(cellMap.get(dateStr) || null);
                if (week.length === 7) { weeks.push(week); week = []; }
              }
              if (week.length > 0) {
                while (week.length < 7) week.push(null);
                weeks.push(week);
              }

              const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
              const selectedDate = date;

              // Find cheapest and most expensive dates
              let cheapestDate = "", expensiveDate = "";
              let cheapestP = Infinity, expensiveP = -Infinity;
              for (const c of heatmap.cells) {
                if (c.predicted_price > 0 && c.predicted_price < cheapestP) { cheapestP = c.predicted_price; cheapestDate = c.departure_date; }
                if (c.predicted_price > expensiveP) { expensiveP = c.predicted_price; expensiveDate = c.departure_date; }
              }

              return (
                <div>
                  {/* Day-of-week header */}
                  <div className="grid grid-cols-7">
                    {DOW_LABELS.map((d, i) => (
                      <div key={d} className={`py-1 text-center text-[10px] font-medium ${
                        i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-[var(--muted-foreground)]"
                      }`}>{d}</div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-[1px] bg-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
                    {weeks.flat().map((cell, idx) => {
                      const ci = idx % 7;
                      if (!cell) {
                        return <div key={idx} className="bg-[var(--background)] h-10" />;
                      }
                      const day = Number(cell.departure_date.slice(8));
                      const ratio = range > 0 ? (cell.predicted_price - minP) / range : 0;
                      const isSelected = cell.departure_date === selectedDate;
                      const isSun = ci === 0;
                      const isSat = ci === 6;
                      const r = Math.round(ratio * 200 + 40);
                      const g = Math.round((1 - ratio) * 180 + 50);
                      const isDark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
                      const opacity = isDark ? 0.25 + ratio * 0.30 : 0.15 + ratio * 0.20;

                      return (
                        <div
                          key={idx}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setDate(cell.departure_date);
                            handlePredict(originCode, destCode, cell.departure_date);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setDate(cell.departure_date);
                              handlePredict(originCode, destCode, cell.departure_date);
                            }
                          }}
                          className={`relative bg-[var(--background)] h-10 flex flex-col justify-between p-1 cursor-pointer transition-all hover:ring-2 hover:ring-inset hover:ring-farenheit-300 hover:z-10 ${
                            isSelected ? "z-10 ring-2 ring-inset ring-farenheit-500" : ""
                          }`}
                          style={{ backgroundColor: `rgba(${r}, ${g}, 60, ${isSelected ? opacity + 0.08 : opacity})` }}
                          title={`${cell.departure_date}: ${formatPrice(cell.predicted_price)} — 클릭하여 예측 조회`}
                          aria-label={`${cell.departure_date}: ${formatPrice(cell.predicted_price)}`}
                        >
                          <div className="flex items-center gap-0.5">
                            <span className={`text-[10px] leading-none font-medium ${
                              isSun ? "text-red-500 dark:text-red-400" : isSat ? "text-blue-500 dark:text-blue-400" : "text-[var(--foreground)]"
                            }`}>
                              {day}
                            </span>
                            {cell.departure_date === cheapestDate && range > 0 && (
                              <span className="w-1 h-1 rounded-full bg-green-500" title="이 달 최저가" />
                            )}
                            {cell.departure_date === expensiveDate && range > 0 && (
                              <span className="w-1 h-1 rounded-full bg-red-500" title="이 달 최고가" />
                            )}
                          </div>
                          <span className="text-[10px] leading-none font-semibold text-[var(--foreground)] opacity-65 text-right">
                            {(cell.predicted_price / 10000).toFixed(cell.predicted_price >= 1000000 ? 0 : 1)}
                            <span className="text-[8px] font-normal">만</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Min/Max summary */}
                  {range > 0 && (
                    <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-[var(--muted-foreground)]">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        최저 {cheapestDate.slice(8)}일 {formatPrice(cheapestP)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        최고 {expensiveDate.slice(8)}일 {formatPrice(expensiveP)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {!heatmapLoading && heatmap && heatmap.cells.length === 0 && (() => {
              // Show month navigation even when no data
              const monthStr = heatmapMonth || date.slice(0, 7);
              if (!monthStr || monthStr.length < 7) return (
                <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                  이 달의 히트맵 데이터가 아직 없습니다.
                </p>
              );
              const yr = Number(monthStr.slice(0, 4));
              const mo = Number(monthStr.slice(5, 7)); // 1-indexed
              const prevMonth = mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, "0")}`;
              const nextMonth = mo === 12 ? `${yr + 1}-01` : `${yr}-${String(mo + 1).padStart(2, "0")}`;
              const today = getLocalToday();
              const todayMonth = today.slice(0, 7);
              const canPrev = prevMonth >= todayMonth;
              return (
                <div className="py-6 text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <button
                      onClick={() => canPrev && loadHeatmap(originCode, destCode, prevMonth)}
                      disabled={!canPrev}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--muted)] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="이전 달"
                    >
                      <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                      </svg>
                    </button>
                    <span className="text-sm font-semibold min-w-[80px]">{yr}년 {mo}월</span>
                    <button
                      onClick={() => loadHeatmap(originCode, destCode, nextMonth)}
                      className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--muted)] transition-colors"
                      aria-label="다음 달"
                    >
                      <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    이 달의 히트맵 데이터가 아직 없습니다. 가격 수집 후 자동 생성됩니다.
                  </p>
                </div>
              );
            })()}

            {!heatmapLoading && !heatmap && (
              <p className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                노선과 출발일을 입력하면 해당 월의 히트맵이 표시됩니다.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Initial State */}
      {!searched && !loading && (
        <div className="bg-[var(--background)] rounded-xl p-10 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <svg aria-hidden="true" className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
          <p className="font-medium">노선과 출발일을 입력하세요</p>
        </div>
      )}
    </div>
  );
}

export default function PredictionsPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 w-28 bg-[var(--muted)] rounded animate-pulse" />
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-lg animate-pulse" />)}
          </div>
        </div>
      </div>
    }>
      <PredictionsContent />
    </Suspense>
  );
}

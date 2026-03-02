"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { predictionsApi, routesApi, type PredictionResponse, type HeatmapResponse } from "@/lib/api-client";
import { getLocalToday, getDateOneYearLater, formatRelativeTime, VALID_CABIN_CLASSES, SAME_ORIGIN_DEST_MSG } from "@/lib/utils";

const DIRECTION_CONFIG: Record<string, { color: string; text: string; arrow: string }> = {
  UP: { color: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800", text: "상승 예상", arrow: "↑" },
  DOWN: { color: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800", text: "하락 예상", arrow: "↓" },
  STABLE: { color: "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700", text: "안정", arrow: "→" },
};

function DirectionBadge({ direction }: { direction: string }) {
  const c = DIRECTION_CONFIG[direction] || DIRECTION_CONFIG.STABLE;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${c.color}`}>
      {c.arrow} {c.text}
    </span>
  );
}

function PredictionsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [originCode, setOriginCode] = useState(searchParams.get("origin") || "");
  const [originDisplay, setOriginDisplay] = useState("");
  const [destCode, setDestCode] = useState(searchParams.get("dest") || "");
  const [destDisplay, setDestDisplay] = useState("");
  const [date, setDate] = useState(searchParams.get("date") || "");
  const cabinParam = searchParams.get("cabin") || "ECONOMY";
  const cabinClass = (VALID_CABIN_CLASSES as readonly string[]).includes(cabinParam) ? cabinParam : "ECONOMY";
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Heatmap uses same origin/dest, auto-derives month from date
  const [heatmap, setHeatmap] = useState<HeatmapResponse | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const requestIdRef = useRef(0);

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
      setError("서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해주세요.");
      setPrediction(null);
      setLoading(false);
      return; // Skip heatmap on prediction failure
    }
    setLoading(false);

    // Auto-load heatmap for the same month (only if prediction succeeded)
    const month = depDate.slice(0, 7);
    if (!month || month.length < 7) return;
    setHeatmapLoading(true);
    try {
      const hm = await predictionsApi.heatmap({ origin, dest, month, cabin_class: cabinClass });
      if (currentRequestId !== requestIdRef.current) return;
      setHeatmap(hm);
    } catch {
      if (currentRequestId !== requestIdRef.current) return;
      setHeatmap(null);
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setHeatmapLoading(false);
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
      handlePredict(o, d, dt);
    }
  }, [searchParams, searched, handlePredict]);

  const handleSwap = () => {
    const tc = originCode, td = originDisplay;
    setOriginCode(destCode); setOriginDisplay(destDisplay);
    setDestCode(tc); setDestDisplay(td);
    originKeyRef.current += 1;
    destKeyRef.current += 1;
  };

  const hasPredictionData = prediction && prediction.predicted_price !== null && prediction.model_version !== "none";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">가격 예측</h1>

      {/* Single Query Form */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          노선과 출발일을 입력하면 AI 가격 예측과 월간 히트맵을 함께 보여드립니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr_auto] gap-4 items-end">
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
              className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] hover:bg-farenheit-50 hover:border-farenheit-300 transition-colors disabled:opacity-30"
              title="출발지/도착지 바꾸기"
              aria-label="출발지와 도착지 바꾸기"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
          <div className="flex items-end">
            <button
              onClick={() => {
                const missing: string[] = [];
                if (!originCode) missing.push("출발지");
                if (!destCode) missing.push("도착지");
                if (!date) missing.push("출발일");
                if (missing.length > 0) {
                  setValidationMsg(`${missing.join(", ")}을(를) 입력해주세요.`);
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

        {/* Mobile swap */}
        <button
          onClick={handleSwap}
          disabled={!originCode || !destCode}
          className="md:hidden w-full mt-2 py-2 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] hover:bg-farenheit-50 transition-colors disabled:opacity-30 text-sm text-[var(--muted-foreground)]"
        >
          <svg className="w-4 h-4 rotate-90 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          출발지/도착지 바꾸기
        </button>
        {validationMsg && (
          <p role="alert" className="text-xs text-red-500 mt-2">{validationMsg}</p>
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
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center">
          <div className="inline-block w-8 h-8 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin mb-4" />
          <p className="text-[var(--muted-foreground)]">AI가 가격 추세를 분석하고 있습니다...</p>
        </div>
      )}

      {/* Prediction Result */}
      {searched && !loading && hasPredictionData && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)] space-y-4" aria-live="polite">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">예측 결과</h2>
            <DirectionBadge direction={prediction.price_direction} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">예측 가격</p>
              <p className="text-lg sm:text-xl font-bold break-all">{Number.isFinite(Number(prediction.predicted_price)) ? `₩${Number(prediction.predicted_price).toLocaleString()}` : "-"}</p>
            </div>
            {prediction.confidence_low != null && Number.isFinite(Number(prediction.confidence_low)) && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">예측 하한</p>
                <p className="text-lg font-medium text-green-600 dark:text-green-400">₩{Number(prediction.confidence_low).toLocaleString()}</p>
              </div>
            )}
            {prediction.confidence_high != null && Number.isFinite(Number(prediction.confidence_high)) && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">예측 상한</p>
                <p className="text-lg font-medium text-red-600 dark:text-red-400">₩{Number(prediction.confidence_high).toLocaleString()}</p>
              </div>
            )}
            {prediction.confidence_score != null && Number.isFinite(Number(prediction.confidence_score)) && (() => {
              const pct = Math.round(Number(prediction.confidence_score) * 100);
              const label = pct >= 85 ? "높음" : pct >= 60 ? "보통" : "낮음";
              const color = pct >= 85 ? "text-green-600" : pct >= 60 ? "text-yellow-600" : "text-red-600";
              return (
                <div>
                  <p className="text-xs text-[var(--muted-foreground)]">신뢰도</p>
                  <p className="text-lg font-medium">{pct}% <span className={`text-sm ${color}`}>({label})</span></p>
                </div>
              );
            })()}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            모델: {prediction.model_version}
            {prediction.predicted_at && ` | 예측 시점: ${formatRelativeTime(prediction.predicted_at)}`}
          </p>
        </div>
      )}

      {/* Forecast Series */}
      {searched && !loading && prediction && prediction.forecast_series.length > 1 && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold mb-3">출발일별 가격 전망</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            같은 노선의 다른 출발일 예측 가격입니다. 저렴한 날짜를 비교해보세요.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 pr-4 font-medium text-[var(--muted-foreground)]">출발일</th>
                  <th className="text-right py-2 px-4 font-medium text-[var(--muted-foreground)]">예측 가격</th>
                  <th className="text-right py-2 px-4 font-medium text-[var(--muted-foreground)]">하한</th>
                  <th className="text-right py-2 pl-4 font-medium text-[var(--muted-foreground)]">상한</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                const allPrices = prediction.forecast_series.map(p => p.predicted_price).filter(p => Number.isFinite(p) && p > 0);
                const minForecast = allPrices.length > 0 ? Math.min(...allPrices) : 0;
                return prediction.forecast_series.slice(0, 15).map((fp) => {
                  const isSelected = fp.date === prediction.departure_date;
                  const isLowest = fp.predicted_price === minForecast && minForecast > 0;
                  return (
                    <tr
                      key={fp.date}
                      className={`border-b border-[var(--border)] last:border-0 ${
                        isSelected ? "bg-farenheit-50/50 dark:bg-farenheit-950/20" : ""
                      }`}
                    >
                      <td className="py-2 pr-4">
                        <span className="font-medium">{fp.date.slice(5)}</span>
                        {isSelected && <span className="text-xs text-farenheit-500 ml-1.5">선택</span>}
                        {isLowest && <span className="text-xs text-green-600 ml-1.5">최저</span>}
                      </td>
                      <td className={`text-right py-2 px-4 font-semibold ${isLowest ? "text-green-600 dark:text-green-400" : ""}`}>
                        {Number.isFinite(fp.predicted_price) ? `₩${fp.predicted_price.toLocaleString()}` : "-"}
                      </td>
                      <td className="text-right py-2 px-4 text-[var(--muted-foreground)]">
                        {Number.isFinite(fp.confidence_low) ? `₩${fp.confidence_low.toLocaleString()}` : "-"}
                      </td>
                      <td className="text-right py-2 pl-4 text-[var(--muted-foreground)]">
                        {Number.isFinite(fp.confidence_high) ? `₩${fp.confidence_high.toLocaleString()}` : "-"}
                      </td>
                    </tr>
                  );
                });
              })()}
              </tbody>
            </table>
          </div>
          {prediction.forecast_series.length > 15 && (
            <p className="text-xs text-[var(--muted-foreground)] mt-2 text-center">
              {prediction.forecast_series.length}개 날짜 중 15개를 표시합니다
            </p>
          )}
        </div>
      )}

      {searched && !loading && !error && !hasPredictionData && (
        <div className="rounded-xl p-8 border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
            <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </div>
          <p className="font-semibold text-blue-800 dark:text-blue-200">이 노선의 가격 데이터를 수집 중입니다</p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-2 max-w-md mx-auto">
            약 1시간 후 AI 예측이 생성됩니다. 먼저 항공편을 검색하여 가격 데이터를 수집하세요.
          </p>
          <Link
            href={originCode && destCode && date
              ? `/search?${new URLSearchParams({ origin: originCode, dest: destCode, date }).toString()}`
              : "/search"}
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-lg bg-blue-600 dark:bg-blue-700 text-white font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            항공편 검색하러 가기
          </Link>
        </div>
      )}

      {/* Heatmap Section - auto-loaded with same route */}
      {searched && !loading && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold mb-2">
            월간 가격 히트맵
            {date && date.length >= 7 && (() => {
              const [y, m] = date.slice(0, 7).split("-");
              return m ? <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">{y}년 {Number(m)}월</span> : null;
            })()}
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            같은 노선의 출발일별 예상 가격입니다. 초록색은 저렴, 빨간색은 비싼 날짜입니다.
          </p>

          {heatmapLoading && (
            <div>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="p-2 rounded-lg border border-[var(--border)] animate-pulse">
                    <div className="h-3 w-10 mx-auto bg-[var(--muted)] rounded mb-1" />
                    <div className="h-4 w-14 mx-auto bg-[var(--muted)] rounded" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!heatmapLoading && heatmap && heatmap.cells.length > 0 && (
            <div>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-3 text-xs text-[var(--muted-foreground)]">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/50 border border-green-300 dark:border-green-700" /> 저렴</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-900/50 border border-yellow-300 dark:border-yellow-700" /> 보통</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700" /> 비쌈</span>
                <span className="ml-auto text-[10px]">같은 달 내 상대적 비교</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                {heatmap.cells.map((cell) => (
                  <div
                    key={cell.departure_date}
                    className={`p-2 rounded-lg text-center text-xs border ${
                      cell.price_level === "LOW" ? "bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800" :
                      cell.price_level === "HIGH" ? "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800" :
                      "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800"
                    }`}
                  >
                    <p className="font-medium">{cell.departure_date.slice(5)}</p>
                    <p className="font-bold mt-0.5">₩{Number.isFinite(Number(cell.predicted_price)) ? Number(cell.predicted_price).toLocaleString() : "-"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!heatmapLoading && heatmap && heatmap.cells.length === 0 && (
            <div className="p-8 text-center text-[var(--muted-foreground)]">
              <p className="font-medium">이 달의 히트맵 데이터가 아직 없습니다.</p>
              <p className="text-sm mt-1">가격 데이터가 쌓이면 히트맵이 자동으로 생성됩니다.</p>
            </div>
          )}

          {!heatmapLoading && !heatmap && (
            <div className="p-8 text-center text-[var(--muted-foreground)]">
              <p className="text-sm">위에서 노선과 출발일을 입력하면 해당 월의 히트맵도 함께 표시됩니다.</p>
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!searched && !loading && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <svg className="w-12 h-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
          <p className="text-lg mb-2">출발지, 도착지, 출발일을 입력하세요</p>
          <p className="text-sm">AI가 가격 변동 추세를 분석하고 월간 히트맵을 보여드립니다</p>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-lg animate-pulse" />)}
          </div>
        </div>
      </div>
    }>
      <PredictionsContent />
    </Suspense>
  );
}

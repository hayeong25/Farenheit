"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { predictionsApi, routesApi } from "@/lib/api-client";

interface PredictionResult {
  route_id: number;
  departure_date: string;
  cabin_class: string;
  predicted_price: number | null;
  confidence_low: number | null;
  confidence_high: number | null;
  price_direction: string;
  confidence_score: number | null;
  model_version: string;
  predicted_at: string | null;
}

interface HeatmapCell {
  departure_date: string;
  weeks_before: number;
  predicted_price: number;
  price_level: string;
}

interface HeatmapResult {
  origin: string;
  destination: string;
  month: string;
  cells: HeatmapCell[];
}

function DirectionBadge({ direction }: { direction: string }) {
  const config: Record<string, { color: string; text: string; arrow: string }> = {
    UP: { color: "text-red-600 bg-red-50 border-red-200", text: "상승 예상", arrow: "↑" },
    DOWN: { color: "text-green-600 bg-green-50 border-green-200", text: "하락 예상", arrow: "↓" },
    STABLE: { color: "text-gray-600 bg-gray-50 border-gray-200", text: "안정", arrow: "→" },
  };
  const c = config[direction] || config.STABLE;
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
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Heatmap uses same origin/dest, auto-derives month from date
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  // Swap refs
  const originKeyRef = useRef(0);
  const destKeyRef = useRef(0);

  // Resolve IATA codes to display names on mount
  useEffect(() => {
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    if (o && !originDisplay) {
      routesApi.searchAirports(o).then((airports) => {
        const match = airports.find(a => a.iata_code === o);
        if (match) {
          const name = match.city_ko || match.city;
          setOriginDisplay(`${name} (${o})`);
          originKeyRef.current += 1;
        } else {
          setOriginDisplay(o);
        }
      }).catch(() => setOriginDisplay(o));
    }
    if (d && !destDisplay) {
      routesApi.searchAirports(d).then((airports) => {
        const match = airports.find(a => a.iata_code === d);
        if (match) {
          const name = match.city_ko || match.city;
          setDestDisplay(`${name} (${d})`);
          destKeyRef.current += 1;
        } else {
          setDestDisplay(d);
        }
      }).catch(() => setDestDisplay(d));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePredict = useCallback(async (origin: string, dest: string, depDate: string) => {
    if (!origin || !dest || !depDate) return;
    setLoading(true);
    setSearched(true);
    setError(null);

    // Update URL
    router.replace(`/predictions?origin=${origin}&dest=${dest}&date=${depDate}`, { scroll: false });

    try {
      const result = await predictionsApi.get({
        origin,
        dest,
        departure_date: depDate,
      }) as PredictionResult;
      setPrediction(result);
    } catch {
      setError("예측 조회 중 오류가 발생했습니다. 서버 연결을 확인해주세요.");
      setPrediction(null);
    } finally {
      setLoading(false);
    }

    // Auto-load heatmap for the same month
    const month = depDate.slice(0, 7);
    setHeatmapLoading(true);
    try {
      const hm = await predictionsApi.heatmap({ origin, dest, month }) as HeatmapResult;
      setHeatmap(hm);
    } catch {
      setHeatmap(null);
    } finally {
      setHeatmapLoading(false);
    }
  }, [router]);

  // Auto-search on mount if URL params present
  useEffect(() => {
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    const dt = searchParams.get("date");
    if (o && d && dt && !searched) {
      handlePredict(o, d, dt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              disabled={!originCode && !destCode}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] hover:bg-farenheit-50 hover:border-farenheit-300 transition-colors disabled:opacity-30"
              title="출발지/도착지 바꾸기"
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
            <label className="block text-sm font-medium mb-1">출발일</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={() => handlePredict(originCode, destCode, date)}
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
          disabled={!originCode && !destCode}
          className="md:hidden w-full mt-2 py-2 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] hover:bg-farenheit-50 transition-colors disabled:opacity-30 text-sm text-[var(--muted-foreground)]"
        >
          <svg className="w-4 h-4 rotate-90 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          출발지/도착지 바꾸기
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
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
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">예측 결과</h2>
            <DirectionBadge direction={prediction.price_direction} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">예측 가격</p>
              <p className="text-xl font-bold">₩{Number(prediction.predicted_price).toLocaleString()}</p>
            </div>
            {prediction.confidence_low && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">예측 하한</p>
                <p className="text-lg font-medium text-green-600">₩{Number(prediction.confidence_low).toLocaleString()}</p>
              </div>
            )}
            {prediction.confidence_high && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">예측 상한</p>
                <p className="text-lg font-medium text-red-600">₩{Number(prediction.confidence_high).toLocaleString()}</p>
              </div>
            )}
            {prediction.confidence_score && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">신뢰도</p>
                <p className="text-lg font-medium">{(Number(prediction.confidence_score) * 100).toFixed(0)}%</p>
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            모델: {prediction.model_version}
            {prediction.predicted_at && ` | 예측 시각: ${new Date(prediction.predicted_at).toLocaleString("ko-KR")}`}
          </p>
        </div>
      )}

      {searched && !loading && !error && !hasPredictionData && (
        <div className="bg-[var(--background)] rounded-xl p-8 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <p className="font-medium">이 노선의 예측 데이터가 아직 없습니다.</p>
          <p className="text-sm mt-1">먼저 <strong>항공편 검색</strong>에서 이 노선을 검색해 보세요.</p>
          <p className="text-sm mt-1">가격 데이터가 충분히 수집되면 AI 예측이 자동으로 활성화됩니다.</p>
          {originCode && destCode && date && (
            <a
              href={`/search?origin=${originCode}&dest=${destCode}&date=${date}`}
              className="inline-block mt-4 px-5 py-2.5 rounded-lg bg-farenheit-500 text-white font-medium hover:bg-farenheit-600 transition-colors text-sm"
            >
              이 노선 검색하기
            </a>
          )}
        </div>
      )}

      {/* Heatmap Section - auto-loaded with same route */}
      {searched && !loading && (
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold mb-2">
            월간 가격 히트맵
            {date && <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">{date.slice(0, 7)}</span>}
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            같은 노선의 출발일별 예상 가격입니다. 초록색은 저렴, 빨간색은 비싼 날짜입니다.
          </p>

          {heatmapLoading && (
            <div className="p-8 text-center">
              <div className="inline-block w-6 h-6 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin mb-2" />
              <p className="text-sm text-[var(--muted-foreground)]">히트맵 로딩 중...</p>
            </div>
          )}

          {!heatmapLoading && heatmap && heatmap.cells.length > 0 && (
            <div>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-3 text-xs text-[var(--muted-foreground)]">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> 저렴</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" /> 보통</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> 비쌈</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2">
                {heatmap.cells.map((cell, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded-lg text-center text-xs border ${
                      cell.price_level === "LOW" ? "bg-green-50 text-green-800 border-green-200" :
                      cell.price_level === "HIGH" ? "bg-red-50 text-red-800 border-red-200" :
                      "bg-yellow-50 text-yellow-800 border-yellow-200"
                    }`}
                  >
                    <p className="font-medium">{cell.departure_date.slice(5)}</p>
                    <p className="font-bold mt-0.5">₩{Number(cell.predicted_price).toLocaleString()}</p>
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
      <div className="text-center py-12 text-[var(--muted-foreground)]">로딩 중...</div>
    }>
      <PredictionsContent />
    </Suspense>
  );
}

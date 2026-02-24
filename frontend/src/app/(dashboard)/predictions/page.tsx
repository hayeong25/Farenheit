"use client";

import { useState } from "react";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { predictionsApi } from "@/lib/api-client";

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

export default function PredictionsPage() {
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [date, setDate] = useState("");
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [heatmapOrigin, setHeatmapOrigin] = useState("");
  const [heatmapDest, setHeatmapDest] = useState("");
  const [heatmapMonth, setHeatmapMonth] = useState("");
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);

  const handlePredict = async () => {
    if (!originCode || !destCode || !date) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const result = await predictionsApi.get({
        origin: originCode,
        dest: destCode,
        departure_date: date,
      }) as PredictionResult;
      setPrediction(result);
    } catch {
      setError("예측 조회 중 오류가 발생했습니다. 서버 연결을 확인해주세요.");
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  };

  const handleHeatmap = async () => {
    if (!heatmapOrigin || !heatmapDest || !heatmapMonth) return;
    setHeatmapLoading(true);
    setHeatmapError(null);
    try {
      const result = await predictionsApi.heatmap({
        origin: heatmapOrigin,
        dest: heatmapDest,
        month: heatmapMonth,
      }) as HeatmapResult;
      setHeatmap(result);
    } catch {
      setHeatmapError("히트맵 조회 중 오류가 발생했습니다.");
      setHeatmap(null);
    } finally {
      setHeatmapLoading(false);
    }
  };

  const hasPredictionData = prediction && prediction.predicted_price !== null && prediction.model_version !== "none";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">가격 예측</h1>

      {/* Prediction Query */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-2">AI 가격 예측 조회</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          노선과 출발일을 선택하면 AI가 가격 변동 추세를 분석합니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <AirportSearch
            label="출발지"
            placeholder="출발 도시"
            value=""
            onSelect={(code) => setOriginCode(code)}
          />
          <AirportSearch
            label="도착지"
            placeholder="도착 도시"
            value=""
            onSelect={(code) => setDestCode(code)}
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
              onClick={handlePredict}
              disabled={!originCode || !destCode || !date || loading}
              className="w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "분석 중..." : "예측 조회"}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="mt-6 p-8 text-center">
            <div className="inline-block w-6 h-6 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin mb-2" />
            <p className="text-sm text-[var(--muted-foreground)]">AI가 가격 추세를 분석하고 있습니다...</p>
          </div>
        )}

        {/* Prediction Result */}
        {searched && !loading && hasPredictionData && (
          <div className="mt-6 p-5 rounded-lg bg-[var(--muted)] space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold">예측 결과</h3>
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
          <div className="mt-6 p-5 rounded-lg bg-[var(--muted)] text-center text-[var(--muted-foreground)]">
            <p className="font-medium">이 노선의 예측 데이터가 아직 없습니다.</p>
            <p className="text-sm mt-1">먼저 <strong>항공편 검색</strong>에서 이 노선을 검색해 보세요.</p>
            <p className="text-sm mt-1">가격 데이터가 충분히 수집되면 AI 예측이 자동으로 활성화됩니다.</p>
          </div>
        )}
      </div>

      {/* Heatmap Section */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-2">가격 히트맵</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          출발일별 예상 가격을 히트맵으로 확인하세요. 초록색은 저렴, 빨간색은 비싼 날짜입니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <AirportSearch
            label="출발지"
            placeholder="출발 도시"
            value=""
            onSelect={(code) => setHeatmapOrigin(code)}
          />
          <AirportSearch
            label="도착지"
            placeholder="도착 도시"
            value=""
            onSelect={(code) => setHeatmapDest(code)}
          />
          <div>
            <label className="block text-sm font-medium mb-1">월</label>
            <input
              type="month"
              value={heatmapMonth}
              onChange={(e) => setHeatmapMonth(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleHeatmap}
              disabled={!heatmapOrigin || !heatmapDest || !heatmapMonth || heatmapLoading}
              className="w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {heatmapLoading ? "조회 중..." : "히트맵 조회"}
            </button>
          </div>
        </div>

        {heatmapError && (
          <div className="mt-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {heatmapError}
          </div>
        )}

        {heatmap && heatmap.cells.length > 0 && (
          <div className="mt-6">
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

        {heatmap && heatmap.cells.length === 0 && !heatmapError && (
          <div className="mt-6 p-8 text-center text-[var(--muted-foreground)]">
            <p className="font-medium">아직 충분한 데이터가 없습니다.</p>
            <p className="text-sm mt-1">가격 데이터가 쌓이면 히트맵이 자동으로 생성됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

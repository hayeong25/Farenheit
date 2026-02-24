"use client";

import { useState } from "react";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { predictionsApi } from "@/lib/api-client";

interface PredictionResult {
  route_id: number;
  departure_date: string;
  cabin_class: string;
  predicted_price: number;
  confidence_low: number | null;
  confidence_high: number | null;
  price_direction: string;
  confidence_score: number | null;
  model_version: string;
  predicted_at: string;
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
    UP: { color: "text-red-600 bg-red-50", text: "상승 예상", arrow: "↑" },
    DOWN: { color: "text-green-600 bg-green-50", text: "하락 예상", arrow: "↓" },
    STABLE: { color: "text-gray-600 bg-gray-50", text: "안정", arrow: "→" },
  };
  const c = config[direction] || config.STABLE;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${c.color}`}>
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

  const [heatmapOrigin, setHeatmapOrigin] = useState("");
  const [heatmapDest, setHeatmapDest] = useState("");
  const [heatmapMonth, setHeatmapMonth] = useState("");
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  const handlePredict = async () => {
    if (!originCode || !destCode || !date) return;
    setLoading(true);
    setSearched(true);
    try {
      const result = await predictionsApi.get({
        route_id: 0, // Will use origin/dest lookup
        departure_date: date,
      }) as PredictionResult;
      setPrediction(result);
    } catch {
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  };

  const handleHeatmap = async () => {
    if (!heatmapOrigin || !heatmapDest || !heatmapMonth) return;
    setHeatmapLoading(true);
    try {
      const result = await predictionsApi.heatmap({
        origin: heatmapOrigin,
        dest: heatmapDest,
        month: heatmapMonth,
      }) as HeatmapResult;
      setHeatmap(result);
    } catch {
      setHeatmap(null);
    } finally {
      setHeatmapLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">가격 예측</h1>

      {/* Prediction Query */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">AI 가격 예측 조회</h2>
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

        {/* Prediction Result */}
        {searched && !loading && prediction && (
          <div className="mt-6 p-5 rounded-lg bg-[var(--muted)] space-y-4">
            <div className="flex items-center justify-between">
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
              모델: {prediction.model_version} | 예측 시각: {new Date(prediction.predicted_at).toLocaleString("ko-KR")}
            </p>
          </div>
        )}

        {searched && !loading && !prediction && (
          <div className="mt-6 p-5 rounded-lg bg-[var(--muted)] text-center text-[var(--muted-foreground)]">
            <p>이 노선의 예측 데이터가 아직 없습니다.</p>
            <p className="text-sm mt-1">가격 데이터가 충분히 수집되면 AI 예측이 활성화됩니다.</p>
          </div>
        )}
      </div>

      {/* Heatmap Section */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">가격 히트맵</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          출발일별 예상 가격을 히트맵으로 확인하세요. 색이 진할수록 가격이 높습니다.
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

        {heatmap && heatmap.cells.length > 0 ? (
          <div className="mt-6 grid grid-cols-7 gap-1">
            {heatmap.cells.map((cell, idx) => (
              <div
                key={idx}
                className={`p-2 rounded text-center text-xs ${
                  cell.price_level === "LOW" ? "bg-green-100 text-green-800" :
                  cell.price_level === "HIGH" ? "bg-red-100 text-red-800" :
                  "bg-yellow-100 text-yellow-800"
                }`}
              >
                <p>{cell.departure_date.slice(5)}</p>
                <p className="font-bold">₩{cell.predicted_price.toLocaleString()}</p>
              </div>
            ))}
          </div>
        ) : heatmap ? (
          <div className="mt-6 p-8 text-center text-[var(--muted-foreground)]">
            <p>아직 충분한 데이터가 수집되지 않았습니다.</p>
            <p className="text-sm mt-1">가격 데이터가 쌓이면 히트맵이 자동으로 생성됩니다.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

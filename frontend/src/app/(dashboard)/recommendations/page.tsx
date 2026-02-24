"use client";

import { useState, useRef } from "react";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { recommendationsApi } from "@/lib/api-client";

interface RecommendationResult {
  origin: string;
  destination: string;
  departure_date: string;
  cabin_class: string;
  signal: string;
  best_airline: string | null;
  current_price: number | null;
  predicted_low: number | null;
  predicted_low_date: string | null;
  confidence: number | null;
  reasoning: string;
}

const signalConfig: Record<string, { color: string; bgColor: string; label: string; description: string }> = {
  BUY: {
    color: "text-green-700",
    bgColor: "bg-green-50 border-green-200",
    label: "BUY",
    description: "지금 구매를 추천합니다",
  },
  WAIT: {
    color: "text-yellow-700",
    bgColor: "bg-yellow-50 border-yellow-200",
    label: "WAIT",
    description: "가격 하락이 예상됩니다. 대기하세요",
  },
  HOLD: {
    color: "text-gray-700",
    bgColor: "bg-gray-50 border-gray-200",
    label: "HOLD",
    description: "추가 데이터 분석이 필요합니다",
  },
};

export default function RecommendationsPage() {
  const [originCode, setOriginCode] = useState("");
  const [originDisplay, setOriginDisplay] = useState("");
  const [destCode, setDestCode] = useState("");
  const [destDisplay, setDestDisplay] = useState("");
  const [date, setDate] = useState("");
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originKeyRef = useRef(0);
  const destKeyRef = useRef(0);

  const handleGetRecommendation = async () => {
    if (!originCode || !destCode || !date) return;
    setLoading(true);
    setSearched(true);
    setError(null);
    try {
      const result = await recommendationsApi.get({
        origin: originCode,
        dest: destCode,
        departure_date: date,
      }) as RecommendationResult;
      setRecommendation(result);
    } catch {
      setError("추천 조회 중 오류가 발생했습니다. 서버 연결을 확인해주세요.");
      setRecommendation(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = () => {
    const tc = originCode, td = originDisplay;
    setOriginCode(destCode); setOriginDisplay(destDisplay);
    setDestCode(tc); setDestDisplay(td);
    originKeyRef.current += 1;
    destKeyRef.current += 1;
  };

  const signal = recommendation ? signalConfig[recommendation.signal] || signalConfig.HOLD : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">구매 추천</h1>

      {/* Signal Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(signalConfig).map(([key, cfg]) => (
          <div key={key} className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${
                key === "BUY" ? "bg-green-500" :
                key === "WAIT" ? "bg-yellow-500" : "bg-gray-400"
              }`} />
              <div>
                <p className={`font-semibold ${cfg.color}`}>{cfg.label}</p>
                <p className="text-sm text-[var(--muted-foreground)]">{cfg.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Query Form */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">추천 조회</h2>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr_auto] gap-4 items-end">
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
            key={`rd-${destKeyRef.current}`}
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
              onClick={handleGetRecommendation}
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
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {loading && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center">
          <div className="inline-block w-8 h-8 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin mb-4" />
          <p className="text-[var(--muted-foreground)]">AI가 최적 구매 타이밍을 분석하고 있습니다...</p>
        </div>
      )}

      {!loading && searched && recommendation && signal && (
        <div className={`rounded-xl p-6 border-2 ${signal.bgColor}`}>
          <div className="flex items-center gap-4 mb-4">
            <span className={`text-4xl font-black ${signal.color}`}>
              {signal.label}
            </span>
            <div>
              <p className={`font-semibold ${signal.color}`}>{signal.description}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {recommendation.origin} → {recommendation.destination} | {recommendation.departure_date}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {recommendation.current_price && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">현재 예측 가격</p>
                <p className="text-lg font-bold">₩{recommendation.current_price.toLocaleString()}</p>
              </div>
            )}
            {recommendation.predicted_low && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">예측 최저가</p>
                <p className="text-lg font-bold text-green-600">₩{recommendation.predicted_low.toLocaleString()}</p>
              </div>
            )}
            {recommendation.best_airline && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">추천 항공사</p>
                <p className="text-lg font-bold">{recommendation.best_airline}</p>
              </div>
            )}
            {recommendation.confidence && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">신뢰도</p>
                <p className="text-lg font-bold">{(recommendation.confidence * 100).toFixed(0)}%</p>
              </div>
            )}
          </div>

          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <p className="text-sm font-medium mb-1">분석 근거</p>
            <p className="text-sm text-[var(--muted-foreground)]">{recommendation.reasoning}</p>
          </div>
        </div>
      )}

      {!loading && searched && !recommendation && !error && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <p className="font-medium">이 노선의 추천 데이터가 아직 없습니다.</p>
          <p className="text-sm mt-1">먼저 <strong>항공편 검색</strong>에서 이 노선을 검색하여 가격 데이터를 수집하세요.</p>
          <p className="text-sm mt-1">충분한 데이터가 쌓이면 AI 구매 추천이 자동으로 활성화됩니다.</p>
        </div>
      )}
    </div>
  );
}

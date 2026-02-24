"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { flightsApi, FlightOffer } from "@/lib/api-client";

function formatDuration(minutes: number | null): string {
  if (!minutes) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function formatPrice(amount: number, currency: string): string {
  if (currency === "KRW") {
    return `₩${Math.round(amount).toLocaleString()}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

function getStopsLabel(stops: number): string {
  if (stops === 0) return "직항";
  return `경유 ${stops}회`;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [originCode, setOriginCode] = useState(searchParams.get("origin") || "");
  const [originDisplay, setOriginDisplay] = useState(searchParams.get("origin") || "");
  const [destCode, setDestCode] = useState(searchParams.get("dest") || "");
  const [destDisplay, setDestDisplay] = useState(searchParams.get("dest") || "");
  const [date, setDate] = useState(searchParams.get("date") || "");
  const [cabinClass, setCabinClass] = useState("ECONOMY");

  // Filters
  const [maxStops, setMaxStops] = useState<string>("any");
  const [sortBy, setSortBy] = useState("price");

  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchInfo, setSearchInfo] = useState<{ origin: string; dest: string; date: string } | null>(null);

  const handleSearch = useCallback(async (
    origin: string, dest: string, depDate: string, cabin: string,
    stops: string, sort: string
  ) => {
    if (!origin || !dest || !depDate) return;

    setIsLoading(true);
    setError(null);
    setSearched(true);
    setSearchInfo({ origin: originDisplay || origin, dest: destDisplay || dest, date: depDate });

    // Update URL
    router.replace(`/search?origin=${origin}&dest=${dest}&date=${depDate}`, { scroll: false });

    try {
      const params: Record<string, string> = {
        origin,
        dest,
        departure_date: depDate,
        cabin_class: cabin,
        sort_by: sort,
      };
      if (stops !== "any") {
        params.max_stops = stops;
      }
      const result = await flightsApi.search(params as any);
      setOffers(result.offers);
    } catch {
      setError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setOffers([]);
    } finally {
      setIsLoading(false);
    }
  }, [originDisplay, destDisplay, router]);

  // Auto-search on URL params
  useEffect(() => {
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    const dt = searchParams.get("date");
    if (o && d && dt && !searched) {
      setOriginCode(o);
      setOriginDisplay(o);
      setDestCode(d);
      setDestDisplay(d);
      setDate(dt);
      handleSearch(o, d, dt, cabinClass, maxStops, sortBy);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-search when filters change
  useEffect(() => {
    if (searched && originCode && destCode && date) {
      handleSearch(originCode, destCode, date, cabinClass, maxStops, sortBy);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxStops, sortBy]);

  const minPrice = offers.length > 0 ? Math.min(...offers.map(o => o.price_amount)) : 0;
  const directCount = offers.filter(o => o.stops === 0).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">항공편 검색</h1>

      {/* Search Form */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <AirportSearch
            label="출발지"
            placeholder="도시 또는 공항 검색"
            value={originDisplay}
            onSelect={(code, display) => { setOriginCode(code); setOriginDisplay(display); }}
          />
          <AirportSearch
            label="도착지"
            placeholder="도시 또는 공항 검색"
            value={destDisplay}
            onSelect={(code, display) => { setDestCode(code); setDestDisplay(display); }}
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
          <div>
            <label className="block text-sm font-medium mb-1">좌석 등급</label>
            <select
              value={cabinClass}
              onChange={(e) => setCabinClass(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            >
              <option value="ECONOMY">이코노미</option>
              <option value="PREMIUM_ECONOMY">프리미엄 이코노미</option>
              <option value="BUSINESS">비즈니스</option>
              <option value="FIRST">퍼스트</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => handleSearch(originCode, destCode, date, cabinClass, maxStops, sortBy)}
              disabled={!originCode || !destCode || !date || isLoading}
              className="w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "검색 중..." : "검색"}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center">
          <div className="inline-block w-8 h-8 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin mb-4" />
          <p className="text-[var(--muted-foreground)]">실시간 항공편을 검색하고 있습니다...</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && searched && (
        <div className="space-y-4">
          {/* Result Header + Filters */}
          <div className="bg-[var(--background)] rounded-xl p-4 border border-[var(--border)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  검색 결과
                  {searchInfo && (
                    <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
                      {searchInfo.origin} → {searchInfo.dest} | {searchInfo.date}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {offers.length}개 항공편{directCount > 0 && ` (직항 ${directCount}개)`}
                </p>
              </div>
              <div className="flex gap-3">
                <select
                  value={maxStops}
                  onChange={(e) => setMaxStops(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)]"
                >
                  <option value="any">경유 전체</option>
                  <option value="0">직항만</option>
                  <option value="1">경유 1회 이하</option>
                  <option value="2">경유 2회 이하</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)]"
                >
                  <option value="price">가격순</option>
                  <option value="duration">소요시간순</option>
                  <option value="stops">경유 적은순</option>
                </select>
              </div>
            </div>
          </div>

          {offers.length === 0 ? (
            <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
              <p className="text-lg mb-2">검색 결과가 없습니다</p>
              <p className="text-sm">다른 날짜나 필터 조건으로 다시 검색해보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offers.map((offer, idx) => {
                const isLowest = offer.price_amount === minPrice;
                return (
                  <div
                    key={idx}
                    className={`bg-[var(--background)] rounded-xl p-5 border transition-shadow hover:shadow-md ${
                      isLowest ? "border-farenheit-300 ring-1 ring-farenheit-100" : "border-[var(--border)]"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Airline & Flight Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="font-bold text-lg">{offer.airline_name || offer.airline_code}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                            {offer.airline_code}
                          </span>
                          {isLowest && (
                            <span className="text-xs px-2 py-0.5 rounded bg-farenheit-50 text-farenheit-600 font-medium">
                              최저가
                            </span>
                          )}
                          {offer.stops === 0 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-600 font-medium">
                              직항
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)] flex-wrap">
                          <span>{formatDuration(offer.duration_minutes)}</span>
                          <span>{getStopsLabel(offer.stops)}</span>
                          {offer.departure_time && (
                            <span>출발 {offer.departure_time.slice(11, 16)}</span>
                          )}
                          {offer.arrival_time && (
                            <span>도착 {offer.arrival_time.slice(11, 16)}</span>
                          )}
                        </div>
                      </div>

                      {/* Price */}
                      <div className="text-right md:min-w-[140px]">
                        <p className={`text-2xl font-bold ${isLowest ? "text-farenheit-500" : ""}`}>
                          {formatPrice(offer.price_amount, offer.currency)}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">1인 편도</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!isLoading && !searched && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <div className="text-4xl mb-4">✈️</div>
          <p className="text-lg mb-2">출발지, 도착지, 출발일을 입력하고 검색하세요</p>
          <p className="text-sm">Amadeus API로 전 세계 항공편을 실시간 검색합니다</p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="text-center py-12 text-[var(--muted-foreground)]">로딩 중...</div>
    }>
      <SearchContent />
    </Suspense>
  );
}

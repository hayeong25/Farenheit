"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { flightsApi, FlightOffer, AirlineInfo } from "@/lib/api-client";

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

function formatTime(timeStr: string | null): string {
  if (!timeStr) return "-";
  return timeStr.slice(11, 16);
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [originCode, setOriginCode] = useState(searchParams.get("origin") || "");
  const [originDisplay, setOriginDisplay] = useState(searchParams.get("origin") || "");
  const [destCode, setDestCode] = useState(searchParams.get("dest") || "");
  const [destDisplay, setDestDisplay] = useState(searchParams.get("dest") || "");
  const [date, setDate] = useState(searchParams.get("date") || "");
  const [returnDate, setReturnDate] = useState(searchParams.get("return_date") || "");
  const [tripType, setTripType] = useState<"round_trip" | "one_way">(
    searchParams.get("return_date") ? "round_trip" : "one_way"
  );
  const [cabinClass, setCabinClass] = useState("ECONOMY");

  // Filters
  const [maxStops, setMaxStops] = useState<string>("any");
  const [sortBy, setSortBy] = useState("price");

  // Airline filter (client-side)
  const [selectedAirlines, setSelectedAirlines] = useState<Set<string>>(new Set());
  const [availableAirlines, setAvailableAirlines] = useState<AirlineInfo[]>([]);

  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchInfo, setSearchInfo] = useState<{
    origin: string; dest: string; date: string; returnDate?: string; tripType: string;
  } | null>(null);

  const handleSearch = useCallback(async (
    origin: string, dest: string, depDate: string, cabin: string,
    stops: string, sort: string, retDate?: string
  ) => {
    if (!origin || !dest || !depDate) return;
    if (tripType === "round_trip" && !retDate) return;

    setIsLoading(true);
    setError(null);
    setSearched(true);
    setSearchInfo({
      origin: originDisplay || origin,
      dest: destDisplay || dest,
      date: depDate,
      returnDate: retDate,
      tripType: retDate ? "round_trip" : "one_way",
    });

    // Update URL
    let url = `/search?origin=${origin}&dest=${dest}&date=${depDate}`;
    if (retDate) url += `&return_date=${retDate}`;
    router.replace(url, { scroll: false });

    try {
      const params: Record<string, string> = {
        origin,
        dest,
        departure_date: depDate,
        cabin_class: cabin,
        sort_by: sort,
      };
      if (retDate) {
        params.return_date = retDate;
      }
      if (stops !== "any") {
        params.max_stops = stops;
      }
      const result = await flightsApi.search(params as any);
      setOffers(result.offers);
      setAvailableAirlines(result.available_airlines);
      // Select all airlines by default
      setSelectedAirlines(new Set(result.available_airlines.map(a => a.code)));
    } catch {
      setError("검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setOffers([]);
    } finally {
      setIsLoading(false);
    }
  }, [originDisplay, destDisplay, router, tripType]);

  // Auto-search on URL params
  useEffect(() => {
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    const dt = searchParams.get("date");
    const rt = searchParams.get("return_date");
    if (o && d && dt && !searched) {
      setOriginCode(o);
      setOriginDisplay(o);
      setDestCode(d);
      setDestDisplay(d);
      setDate(dt);
      if (rt) {
        setReturnDate(rt);
        setTripType("round_trip");
      }
      handleSearch(o, d, dt, cabinClass, maxStops, sortBy, rt || undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-search when filters change
  useEffect(() => {
    if (searched && originCode && destCode && date) {
      const retDate = tripType === "round_trip" ? returnDate : undefined;
      handleSearch(originCode, destCode, date, cabinClass, maxStops, sortBy, retDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxStops, sortBy]);

  // Client-side airline filtering
  const filteredOffers = useMemo(() => {
    if (selectedAirlines.size === 0 || selectedAirlines.size === availableAirlines.length) {
      return offers;
    }
    return offers.filter(o => selectedAirlines.has(o.airline_code));
  }, [offers, selectedAirlines, availableAirlines.length]);

  const minPrice = filteredOffers.length > 0 ? Math.min(...filteredOffers.map(o => o.price_amount)) : 0;
  const directCount = filteredOffers.filter(o => o.stops === 0).length;
  const isRoundTrip = searchInfo?.tripType === "round_trip";

  const toggleAirline = (code: string) => {
    setSelectedAirlines(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const toggleAllAirlines = () => {
    if (selectedAirlines.size === availableAirlines.length) {
      setSelectedAirlines(new Set());
    } else {
      setSelectedAirlines(new Set(availableAirlines.map(a => a.code)));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">항공편 검색</h1>

      {/* Search Form */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        {/* Trip Type Toggle */}
        <div className="flex gap-1 mb-4 bg-[var(--muted)] rounded-lg p-1 w-fit">
          <button
            onClick={() => setTripType("round_trip")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tripType === "round_trip"
                ? "bg-[var(--background)] shadow-sm text-farenheit-600"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            왕복
          </button>
          <button
            onClick={() => { setTripType("one_way"); setReturnDate(""); }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tripType === "one_way"
                ? "bg-[var(--background)] shadow-sm text-farenheit-600"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            편도
          </button>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${
          tripType === "round_trip"
            ? "md:grid-cols-6"
            : "md:grid-cols-5"
        }`}>
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
              onChange={(e) => {
                setDate(e.target.value);
                // If return date is before new departure date, clear it
                if (returnDate && e.target.value > returnDate) {
                  setReturnDate("");
                }
              }}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          {tripType === "round_trip" && (
            <div>
              <label className="block text-sm font-medium mb-1">귀국일</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                min={date || new Date().toISOString().split("T")[0]}
                className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
              />
            </div>
          )}
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
              onClick={() => {
                const retDate = tripType === "round_trip" ? returnDate : undefined;
                handleSearch(originCode, destCode, date, cabinClass, maxStops, sortBy, retDate);
              }}
              disabled={!originCode || !destCode || !date || (tripType === "round_trip" && !returnDate) || isLoading}
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
                      {searchInfo.origin} → {searchInfo.dest}
                      {isRoundTrip ? " (왕복)" : " (편도)"}
                      {" | "}
                      {searchInfo.date}
                      {searchInfo.returnDate && ` ~ ${searchInfo.returnDate}`}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {filteredOffers.length}개 항공편
                  {filteredOffers.length !== offers.length && ` (전체 ${offers.length}개 중)`}
                  {directCount > 0 && ` | 직항 ${directCount}개`}
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

          {/* Airline Filter Checkboxes */}
          {availableAirlines.length > 1 && (
            <div className="bg-[var(--background)] rounded-xl p-4 border border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">항공사 필터</h3>
                <button
                  onClick={toggleAllAirlines}
                  className="text-xs text-farenheit-500 hover:text-farenheit-600"
                >
                  {selectedAirlines.size === availableAirlines.length ? "전체 해제" : "전체 선택"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {availableAirlines.map((airline) => (
                  <label
                    key={airline.code}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                      selectedAirlines.has(airline.code)
                        ? "border-farenheit-300 bg-farenheit-50 text-farenheit-700"
                        : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--foreground)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAirlines.has(airline.code)}
                      onChange={() => toggleAirline(airline.code)}
                      className="sr-only"
                    />
                    <span className="font-mono text-xs">{airline.code}</span>
                    <span>{airline.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {filteredOffers.length === 0 ? (
            <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
              <p className="text-lg mb-2">검색 결과가 없습니다</p>
              <p className="text-sm">
                {selectedAirlines.size < availableAirlines.length
                  ? "항공사 필터를 확인하거나, 다른 조건으로 다시 검색해보세요."
                  : "다른 날짜나 필터 조건으로 다시 검색해보세요."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOffers.map((offer, idx) => {
                const isLowest = offer.price_amount === minPrice;
                return (
                  <div
                    key={idx}
                    className={`bg-[var(--background)] rounded-xl p-5 border transition-shadow hover:shadow-md ${
                      isLowest ? "border-farenheit-300 ring-1 ring-farenheit-100" : "border-[var(--border)]"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Flight Info */}
                      <div className="flex-1 space-y-3">
                        {/* Airline header */}
                        <div className="flex items-center gap-3 flex-wrap">
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

                        {/* Outbound leg */}
                        <div className="flex items-center gap-4 text-sm flex-wrap">
                          <span className="text-xs font-medium text-[var(--muted-foreground)] w-12">
                            {isRoundTrip ? "가는편" : ""}
                          </span>
                          <span className="font-semibold">{formatTime(offer.departure_time)}</span>
                          <span className="text-[var(--muted-foreground)]">→</span>
                          <span className="font-semibold">{formatTime(offer.arrival_time)}</span>
                          <span className="text-[var(--muted-foreground)]">{formatDuration(offer.duration_minutes)}</span>
                          <span className="text-[var(--muted-foreground)]">{getStopsLabel(offer.stops)}</span>
                        </div>

                        {/* Return leg (round-trip only) */}
                        {isRoundTrip && offer.return_departure_time && (
                          <div className="flex items-center gap-4 text-sm flex-wrap">
                            <span className="text-xs font-medium text-[var(--muted-foreground)] w-12">오는편</span>
                            <span className="font-semibold">{formatTime(offer.return_departure_time)}</span>
                            <span className="text-[var(--muted-foreground)]">→</span>
                            <span className="font-semibold">{formatTime(offer.return_arrival_time)}</span>
                            <span className="text-[var(--muted-foreground)]">{formatDuration(offer.return_duration_minutes)}</span>
                            <span className="text-[var(--muted-foreground)]">
                              {offer.return_stops !== null ? getStopsLabel(offer.return_stops) : ""}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="text-right md:min-w-[140px] flex-shrink-0">
                        <p className={`text-2xl font-bold ${isLowest ? "text-farenheit-500" : ""}`}>
                          {formatPrice(offer.price_amount, offer.currency)}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          1인 {isRoundTrip ? "왕복" : "편도"}
                        </p>
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
          <div className="text-4xl mb-4">&#9992;&#65039;</div>
          <p className="text-lg mb-2">출발지, 도착지, 날짜를 입력하고 검색하세요</p>
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

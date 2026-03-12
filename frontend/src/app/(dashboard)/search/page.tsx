"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { flightsApi, FlightOffer, AirlineInfo, PriceHistoryResponse, routesApi } from "@/lib/api-client";
import { formatPrice, saveRecentSearch, getLocalToday, getDateOneYearLater, getMissingFieldsMsg, VALID_CABIN_CLASSES, CABIN_CLASS_LABELS, SAME_ORIGIN_DEST_MSG, RETURN_BEFORE_DEPART_MSG, NETWORK_ERROR_MSG } from "@/lib/utils";

const VALID_STOPS = ["any", "0", "1", "2"];
const VALID_SORTS = ["price", "price_desc", "duration", "stops"];

const CABIN_TO_NAVER: Record<string, string> = { ECONOMY: "Y", BUSINESS: "C", FIRST: "F" };

function buildBookingUrl(
  origin: string, dest: string, departureDate: string,
  returnDate: string | null, cabinClass: string, directOnly: boolean,
): string {
  const depCompact = departureDate.replace(/-/g, "");
  const fareType = CABIN_TO_NAVER[cabinClass] || "Y";
  const direct = directOnly ? "&isDirect=true" : "";
  if (returnDate) {
    const retCompact = returnDate.replace(/-/g, "");
    return `https://flight.naver.com/flights/international/${origin}-${dest}-${depCompact}/${dest}-${origin}-${retCompact}?adult=1&fareType=${fareType}${direct}`;
  }
  return `https://flight.naver.com/flights/international/${origin}-${dest}-${depCompact}?adult=1&fareType=${fareType}${direct}`;
}

function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function getStopsLabel(stops: number): string {
  if (stops === 0) return "직항";
  return `경유 ${stops}회`;
}

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  // Handle full ISO datetime (2024-01-01T14:30:00) and time-only (14:30)
  if (timeStr.includes("T") && timeStr.length >= 16) {
    return timeStr.slice(11, 16);
  }
  // If already HH:MM format or short string
  if (timeStr.length >= 5 && timeStr.includes(":")) {
    return timeStr.slice(0, 5);
  }
  return timeStr;
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
  const cabinParam = searchParams.get("cabin") || "ECONOMY";
  const [cabinClass, setCabinClass] = useState((VALID_CABIN_CLASSES as readonly string[]).includes(cabinParam) ? cabinParam : "ECONOMY");

  // Filters (read from URL for refresh persistence, validate against known values)
  const stopsParam = searchParams.get("stops") || "any";
  const sortParam = searchParams.get("sort") || "price";
  const [maxStops, setMaxStops] = useState<string>(VALID_STOPS.includes(stopsParam) ? stopsParam : "any");
  const [sortBy, setSortBy] = useState(VALID_SORTS.includes(sortParam) ? sortParam : "price");

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
  const [priceHistory, setPriceHistory] = useState<PriceHistoryResponse | null>(null);
  const [dataSource, setDataSource] = useState<string>("live");
  const [validationMsg, setValidationMsg] = useState("");

  // Swap support
  const originKeyRef = useRef(0);
  const destKeyRef = useRef(0);
  const searchIdRef = useRef(0);
  const initialMountRef = useRef(true);

  const handleSearch = useCallback(async (
    origin: string, dest: string, depDate: string, cabin: string,
    stops: string, sort: string, retDate?: string
  ) => {
    if (!origin || !dest || !depDate) return;

    const currentSearchId = ++searchIdRef.current;
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

    // Update URL (include filters for refresh persistence)
    const urlParams = new URLSearchParams({ origin, dest, date: depDate });
    if (retDate) urlParams.set("return_date", retDate);
    if (cabin !== "ECONOMY") urlParams.set("cabin", cabin);
    if (sort !== "price") urlParams.set("sort", sort);
    if (stops !== "any") urlParams.set("stops", stops);
    router.replace(`/search?${urlParams.toString()}`, { scroll: false });

    try {
      const result = await flightsApi.search({
        origin,
        dest,
        departure_date: depDate,
        cabin_class: cabin,
        sort_by: sort === "price_desc" ? "price" : sort,
        ...(retDate ? { return_date: retDate } : {}),
        ...(stops !== "any" ? { max_stops: stops } : {}),
      });
      if (currentSearchId !== searchIdRef.current) return;
      setOffers(result.offers);
      setDataSource(result.data_source || "live");
      setAvailableAirlines(result.available_airlines);
      setSelectedAirlines(new Set(result.available_airlines.map(a => a.code)));

      // Save to recent searches
      const validPrices = result.offers.map(o => Number(o.price_amount)).filter(p => Number.isFinite(p) && p > 0);
      const lowestPrice = validPrices.length > 0
        ? Math.min(...validPrices)
        : undefined;
      saveRecentSearch({
        origin,
        dest,
        originDisplay: originDisplay || origin,
        destDisplay: destDisplay || dest,
        date: depDate,
        returnDate: retDate,
        cabinClass: cabin,
        minPrice: lowestPrice,
      });

      // Load price history if route exists
      if (result.route_id) {
        flightsApi.priceHistory({
          route_id: result.route_id,
          departure_date: depDate,
          days: 30,
        }).then(h => {
          if (currentSearchId === searchIdRef.current) setPriceHistory(h);
        }).catch(() => {
          if (currentSearchId === searchIdRef.current) setPriceHistory(null);
        });
      } else {
        setPriceHistory(null);
      }
    } catch {
      if (currentSearchId !== searchIdRef.current) return;
      setError(NETWORK_ERROR_MSG);
      setOffers([]);
    } finally {
      if (currentSearchId === searchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [originDisplay, destDisplay, router]);

  // Resolve IATA codes to display names and auto-search on URL params (once only)
  const resolvedRef = useRef(false);
  useEffect(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    const o = searchParams.get("origin");
    const d = searchParams.get("dest");
    const dt = searchParams.get("date");
    const rt = searchParams.get("return_date");

    if (o) {
      setOriginCode(o);
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
      setDestCode(d);
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
    if (dt) setDate(dt);
    if (rt) {
      setReturnDate(rt);
      setTripType("round_trip");
    }
    if (o && d && dt && !searched) {
      handleSearch(o, d, dt, cabinClass, maxStops, sortBy, rt || undefined);
    }
  }, [searchParams, searched, handleSearch, cabinClass, maxStops, sortBy]);

  // Re-search when filters change (including cabin class) - skip on initial mount
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }
    if (searched && originCode && destCode && date) {
      const retDate = tripType === "round_trip" ? returnDate : undefined;
      handleSearch(originCode, destCode, date, cabinClass, maxStops, sortBy, retDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxStops, sortBy, cabinClass]);

  // Client-side airline filtering + price_desc sorting
  const filteredOffers = useMemo(() => {
    let result = offers;
    if (selectedAirlines.size > 0 && selectedAirlines.size < availableAirlines.length) {
      result = result.filter(o => selectedAirlines.has(o.airline_code));
    }
    if (sortBy === "price_desc") {
      result = [...result].sort((a, b) => b.price_amount - a.price_amount);
    }
    return result;
  }, [offers, selectedAirlines, availableAirlines.length, sortBy]);

  const minPrice = useMemo(() => {
    let min = 0;
    for (const o of filteredOffers) {
      if (o.price_amount > 0 && (min === 0 || o.price_amount < min)) min = o.price_amount;
    }
    return min;
  }, [filteredOffers]);
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

  const handleSwap = () => {
    const tempCode = originCode;
    const tempDisplay = originDisplay;
    setOriginCode(destCode);
    setOriginDisplay(destDisplay);
    setDestCode(tempCode);
    setDestDisplay(tempDisplay);
    originKeyRef.current += 1;
    destKeyRef.current += 1;
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

        {/* Row 1: Origin / Swap / Destination */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-2 items-end mb-4">
          <AirportSearch
            key={`s-origin-${originKeyRef.current}`}
            label="출발지"
            placeholder="도시 또는 공항 검색"
            value={originDisplay}
            onSelect={(code, display) => { setOriginCode(code); setOriginDisplay(display); setValidationMsg(""); }}
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
            key={`s-dest-${destKeyRef.current}`}
            label="도착지"
            placeholder="도시 또는 공항 검색"
            value={destDisplay}
            onSelect={(code, display) => { setDestCode(code); setDestDisplay(display); setValidationMsg(""); }}
          />
          {/* Mobile swap */}
          <button
            onClick={handleSwap}
            disabled={!originCode || !destCode}
            aria-label="출발지와 도착지 바꾸기"
            className="md:hidden w-full py-2 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] hover:bg-farenheit-50 dark:hover:bg-farenheit-950 transition-colors disabled:opacity-30 text-sm text-[var(--muted-foreground)]"
          >
            <svg aria-hidden="true" className="w-4 h-4 rotate-90 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            출발지/도착지 바꾸기
          </button>
        </div>

        {/* Row 2: Dates + Cabin + Search */}
        <div className={`grid grid-cols-1 gap-4 ${
          tripType === "round_trip" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 md:grid-cols-3"
        }`}>
          <div>
            <label htmlFor="search-departure-date" className="block text-sm font-medium mb-1">출발일</label>
            <input
              id="search-departure-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setValidationMsg("");
                if (returnDate && e.target.value > returnDate) {
                  setReturnDate("");
                  setValidationMsg("출발일이 귀국일보다 늦어 귀국일이 초기화되었습니다.");
                }
              }}
              min={getLocalToday()}
              max={getDateOneYearLater()}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          {tripType === "round_trip" && (
            <div>
              <label htmlFor="search-return-date" className="block text-sm font-medium mb-1">귀국일</label>
              <input
                id="search-return-date"
                type="date"
                value={returnDate}
                onChange={(e) => { setReturnDate(e.target.value); setValidationMsg(""); }}
                min={date || getLocalToday()}
                max={getDateOneYearLater()}
                className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
              />
            </div>
          )}
          <div>
            <label htmlFor="search-cabin-class" className="block text-sm font-medium mb-1">좌석 등급</label>
            <select
              id="search-cabin-class"
              value={cabinClass}
              onChange={(e) => setCabinClass(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            >
              {VALID_CABIN_CLASSES.map((c) => (
                <option key={c} value={c}>{CABIN_CLASS_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col items-stretch justify-end">
            <button
              onClick={() => {
                const missingMsg = getMissingFieldsMsg(originCode, destCode, date, { tripType, returnDate });
                if (missingMsg) {
                  setValidationMsg(missingMsg);
                  return;
                }
                if (tripType === "round_trip" && returnDate && returnDate < date) {
                  setValidationMsg(RETURN_BEFORE_DEPART_MSG);
                  return;
                }
                if (originCode === destCode) {
                  setValidationMsg(SAME_ORIGIN_DEST_MSG);
                  return;
                }
                setValidationMsg("");
                const retDate = tripType === "round_trip" ? returnDate : undefined;
                handleSearch(originCode, destCode, date, cabinClass, maxStops, sortBy, retDate);
              }}
              disabled={isLoading}
              className="w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 hover:shadow-lg hover:shadow-farenheit-500/25 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "검색 중..." : "검색"}
            </button>
            {validationMsg && (
              <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{validationMsg}</p>
            )}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center justify-between gap-3">
          <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
          <button
            onClick={() => {
              const retDate = tripType === "round_trip" ? returnDate : undefined;
              handleSearch(originCode, destCode, date, cabinClass, maxStops, sortBy, retDate);
            }}
            className="shrink-0 px-4 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
              <div className="flex justify-between items-start">
                <div className="space-y-3 flex-1">
                  <div className="h-5 w-32 rounded animate-shimmer" />
                  <div className="flex gap-4">
                    <div className="h-4 w-16 rounded animate-shimmer" />
                    <div className="h-4 w-24 rounded animate-shimmer" />
                    <div className="h-4 w-20 rounded animate-shimmer" />
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="h-7 w-28 rounded animate-shimmer" />
                  <div className="h-4 w-16 rounded ml-auto animate-shimmer" />
                </div>
              </div>
            </div>
          ))}
          <p className="text-center text-sm text-[var(--muted-foreground)]">실시간 항공편을 검색하고 있습니다...</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && searched && (
        <div className="space-y-4" aria-live="polite">
          {/* Result Header + Filters */}
          <div className="bg-[var(--background)] rounded-xl p-4 border border-[var(--border)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {searchInfo?.origin} → {searchInfo?.dest}
                  <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2">
                    {searchInfo?.date?.slice(5).replace("-", "/")}
                    {searchInfo?.returnDate && ` ~ ${searchInfo.returnDate.slice(5).replace("-", "/")}`}
                  </span>
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {filteredOffers.length}개 항공편
                  {filteredOffers.length !== offers.length && ` (전체 ${offers.length}개 중)`}
                  {minPrice > 0 && ` | 최저가 ${formatPrice(minPrice)}`}
                </p>
                {dataSource === "cached" && (
                  <p role="status" className="text-xs text-yellow-600 mt-0.5">
                    실시간 조회 실패 — 이전에 수집된 캐시 데이터입니다
                  </p>
                )}
              </div>
              <div className="flex flex-col md:flex-row gap-2 md:gap-3">
                <select
                  value={maxStops}
                  onChange={(e) => setMaxStops(e.target.value)}
                  aria-label="경유 필터"
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
                  aria-label="정렬 기준"
                  className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--background)]"
                >
                  <option value="price">가격 낮은 순</option>
                  <option value="price_desc">가격 높은 순</option>
                  <option value="duration">소요시간 짧은 순</option>
                  <option value="stops">경유 적은 순</option>
                </select>
              </div>
            </div>
            {/* Quick links to prediction/recommendation */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-[var(--muted-foreground)]">실제 가격은 예약 시점에 따라 다를 수 있습니다</span>
              <span className="text-xs text-[var(--muted-foreground)]">|</span>
              <Link
                href={(() => {
                  const p = new URLSearchParams({ origin: originCode, dest: destCode, date });
                  if (cabinClass !== "ECONOMY") p.set("cabin", cabinClass);
                  return `/predictions?${p.toString()}`;
                })()}
                className="text-xs text-farenheit-500 hover:text-farenheit-600 font-medium"
              >
                가격 예측
              </Link>
              <Link
                href={(() => {
                  const p = new URLSearchParams({ origin: originCode, dest: destCode, date });
                  if (cabinClass !== "ECONOMY") p.set("cabin", cabinClass);
                  return `/recommendations?${p.toString()}`;
                })()}
                className="text-xs text-farenheit-500 hover:text-farenheit-600 font-medium"
              >
                구매 추천
              </Link>
            </div>
          </div>

          {/* Price History Summary */}
          {priceHistory && priceHistory.prices.length > 0 && priceHistory.min_price != null && minPrice > 0 && (
            <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
              <h3 className="text-sm font-semibold mb-3">이 노선 가격 추이 (최근 30일)</h3>
              {(() => {
                const minP = Number(priceHistory.min_price);
                const avgP = Number(priceHistory.avg_price);
                const maxP = Number(priceHistory.max_price);
                const prices = priceHistory.prices.map(p => Number(p.price_amount)).filter(p => Number.isFinite(p) && p > 0);
                const currentMin = minPrice;
                const isGoodPrice = currentMin <= avgP;

                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-3 rounded-lg bg-green-50/50 dark:bg-green-950/20">
                        <p className="text-xs text-[var(--muted-foreground)]">최저가</p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatPrice(Math.round(minP))}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-[var(--muted)]">
                        <p className="text-xs text-[var(--muted-foreground)]">평균가</p>
                        <p className="text-lg font-bold">{formatPrice(Math.round(avgP))}</p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-50/50 dark:bg-red-950/20">
                        <p className="text-xs text-[var(--muted-foreground)]">최고가</p>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatPrice(Math.round(maxP))}</p>
                      </div>
                    </div>

                    {/* Sparkline chart */}
                    {prices.length >= 2 && (() => {
                      const sparMin = Math.min(...prices);
                      const sparMax = Math.max(...prices);
                      const sparRange = sparMax - sparMin || 1;
                      const W = 400, H = 48, pad = 4;
                      const cw = W - pad * 2, ch = H - pad * 2;
                      const pts = prices.map((p, i) => {
                        const x = pad + (i / (prices.length - 1)) * cw;
                        const y = pad + (1 - (p - sparMin) / sparRange) * ch;
                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                      });
                      const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p}`).join(" ");
                      const area = `${line} L${(pad + cw).toFixed(1)},${H} L${pad},${H} Z`;

                      return (
                        <div className="mb-3">
                          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-12" aria-label="가격 추이 스파크라인">
                            <defs>
                              <linearGradient id="sparkGrad" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor={isGoodPrice ? "#22c55e" : "#f59e0b"} stopOpacity="0.2" />
                                <stop offset="100%" stopColor={isGoodPrice ? "#22c55e" : "#f59e0b"} stopOpacity="0.02" />
                              </linearGradient>
                            </defs>
                            <path d={area} fill="url(#sparkGrad)" />
                            <path d={line} fill="none" stroke={isGoodPrice ? "#22c55e" : "#f59e0b"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      );
                    })()}

                    {Number.isFinite(avgP) && avgP > 0 && (() => {
                      const min = prices.length > 0 ? Math.min(...prices) : minP;
                      const max = prices.length > 0 ? Math.max(...prices) : maxP;
                      const range = max - min || 1;
                      const position = ((currentMin - min) / range) * 100;
                      return (
                        <div>
                          <div className="relative h-2 rounded-full bg-gradient-to-r from-green-200 via-yellow-200 to-red-200 dark:from-green-800 dark:via-yellow-800 dark:to-red-800">
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[var(--foreground)] border-2 border-[var(--background)] shadow"
                              style={{ left: `${Math.min(Math.max(position, 5), 95)}%` }}
                              title={`현재 최저가: ${formatPrice(currentMin)}`}
                            />
                          </div>
                          <p className={`text-xs mt-2 font-medium ${isGoodPrice ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}`}>
                            {isGoodPrice
                              ? `현재 최저가(${formatPrice(currentMin)})는 평균보다 저렴합니다`
                              : `현재 최저가(${formatPrice(currentMin)})는 평균보다 높습니다`}
                          </p>
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          )}

          {/* Airline Filter */}
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
                {availableAirlines.map((airline) => {
                  const checked = selectedAirlines.has(airline.code);
                  return (
                    <label
                      key={airline.code}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-all select-none ${
                        checked
                          ? "border-farenheit-400 bg-farenheit-50 dark:bg-farenheit-950 text-farenheit-700 dark:text-farenheit-300 shadow-sm"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-gray-400 dark:hover:border-gray-500"
                      }`}
                    >
                      <span className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                        checked
                          ? "bg-farenheit-500 border-farenheit-500"
                          : "border-gray-300 dark:border-gray-600 bg-[var(--background)]"
                      }`}>
                        {checked && (
                          <svg aria-hidden="true" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAirline(airline.code)}
                        className="sr-only"
                      />
                      <span className="font-medium">{airline.name || airline.code}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {filteredOffers.length === 0 ? (
            <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
              {selectedAirlines.size === 0 && availableAirlines.length > 0 ? (
                <>
                  <p className="text-lg mb-2">항공사가 선택되지 않았습니다</p>
                  <p className="text-sm mb-3">위 항공사 필터에서 최소 1개 항공사를 선택해주세요.</p>
                  <button
                    onClick={() => setSelectedAirlines(new Set(availableAirlines.map(a => a.code)))}
                    className="px-4 py-2 rounded-lg bg-farenheit-500 text-white text-sm font-medium hover:bg-farenheit-600 transition-colors"
                  >
                    전체 선택
                  </button>
                </>
              ) : offers.length === 0 ? (
                <>
                  <p className="text-lg mb-2">이 조건에 맞는 항공편이 없습니다</p>
                  <p className="text-sm">다른 날짜나 경유 조건으로 다시 검색해보세요.</p>
                </>
              ) : (
                <>
                  <p className="text-lg mb-2">필터 조건에 맞는 항공편이 없습니다</p>
                  <p className="text-sm mb-4">
                    현재 필터로는 {offers.length}개 항공편이 모두 숨겨져 있습니다.
                    {maxStops !== "any" && ` (경유 ${maxStops}회 이하)`}
                    {selectedAirlines.size < availableAirlines.length && ` (항공사 ${selectedAirlines.size}/${availableAirlines.length}개 선택)`}
                  </p>
                  <button
                    onClick={() => {
                      setMaxStops("any");
                      setSelectedAirlines(new Set(availableAirlines.map(a => a.code)));
                    }}
                    className="px-5 py-2 rounded-lg border border-farenheit-500 text-farenheit-500 text-sm font-medium hover:bg-farenheit-50 dark:hover:bg-farenheit-950 transition-colors"
                  >
                    필터 초기화
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 animate-stagger">
              {filteredOffers.slice(0, 100).map((offer, idx) => {
                const isLowest = minPrice > 0 && offer.price_amount === minPrice;
                const offerKey = `${offer.airline_code}-${offer.flight_number || ""}-${offer.departure_date}-${offer.stops}-${offer.price_amount}-${idx}`;
                return (
                  <article
                    key={offerKey}
                    aria-label={`${offer.airline_name || offer.airline_code} ${formatPrice(offer.price_amount, offer.currency)}`}
                    className={`bg-[var(--background)] rounded-xl p-5 border transition-all hover:shadow-md hover:-translate-y-0.5 ${
                      isLowest ? "border-farenheit-300 dark:border-farenheit-700 ring-1 ring-farenheit-100 dark:ring-farenheit-900" : "border-[var(--border)]"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Flight Info */}
                      <div className="flex-1 space-y-3">
                        {/* Airline header */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-bold text-lg truncate max-w-[120px] sm:max-w-[160px] md:max-w-[200px]">{offer.airline_name || offer.airline_code}</span>
                          {isLowest && (
                            <span className="text-xs px-2 py-0.5 rounded bg-farenheit-50 dark:bg-farenheit-950 text-farenheit-600 dark:text-farenheit-400 font-medium">
                              최저가
                            </span>
                          )}
                          {offer.stops === 0 && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 font-medium">
                              직항
                            </span>
                          )}
                        </div>

                        {/* Outbound leg */}
                        <div className="flex items-center gap-2 sm:gap-4 text-sm flex-wrap">
                          {isRoundTrip && (
                            <span className="text-xs font-medium text-[var(--muted-foreground)] w-12">가는편</span>
                          )}
                          {isRoundTrip && (
                            <span className="text-xs text-[var(--muted-foreground)]">{String(offer.departure_date).slice(5).replace("-", "/")}</span>
                          )}
                          {offer.flight_number && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                              {offer.flight_number}
                            </span>
                          )}
                          {offer.departure_time ? (
                            <>
                              <span className="font-semibold">{formatTime(offer.departure_time)}</span>
                              {offer.arrival_time && (
                                <>
                                  <span className="text-[var(--muted-foreground)]">&rarr;</span>
                                  <span className="font-semibold">{formatTime(offer.arrival_time)}</span>
                                </>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-[var(--muted-foreground)] italic">시간 미정</span>
                          )}
                          {offer.duration_minutes != null && offer.duration_minutes > 0 && (
                            <span className="text-[var(--muted-foreground)]">{formatDuration(offer.duration_minutes)}</span>
                          )}
                          <span className="text-[var(--muted-foreground)]">{getStopsLabel(offer.stops)}</span>
                        </div>

                        {/* Return leg (round-trip only) */}
                        {isRoundTrip && (
                          <div className="flex items-center gap-2 sm:gap-4 text-sm flex-wrap">
                            <span className="text-xs font-medium text-[var(--muted-foreground)] w-12">오는편</span>
                            {offer.return_date && (
                              <span className="text-xs text-[var(--muted-foreground)]">{String(offer.return_date).slice(5).replace("-", "/")}</span>
                            )}
                            {offer.return_flight_number && (
                              <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                                {offer.return_flight_number}
                              </span>
                            )}
                            {offer.return_departure_time ? (
                              <>
                                <span className="font-semibold">{formatTime(offer.return_departure_time)}</span>
                                {offer.return_arrival_time && (
                                  <>
                                    <span className="text-[var(--muted-foreground)]">&rarr;</span>
                                    <span className="font-semibold">{formatTime(offer.return_arrival_time)}</span>
                                  </>
                                )}
                              </>
                            ) : offer.departure_time ? (
                              <>
                                <span className="font-semibold">{formatTime(offer.departure_time)}</span>
                                {offer.arrival_time && (
                                  <>
                                    <span className="text-[var(--muted-foreground)]">&rarr;</span>
                                    <span className="font-semibold">{formatTime(offer.arrival_time)}</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-[var(--muted-foreground)] italic">시간 미정</span>
                            )}
                            {(offer.return_duration_minutes || offer.duration_minutes) != null && (offer.return_duration_minutes || offer.duration_minutes)! > 0 && (
                              <span className="text-[var(--muted-foreground)]">{formatDuration(offer.return_duration_minutes || offer.duration_minutes)}</span>
                            )}
                            <span className="text-[var(--muted-foreground)]">
                              {getStopsLabel(offer.return_stops ?? offer.stops)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Price + Booking */}
                      <div className="text-right md:min-w-[140px] flex-shrink-0 flex flex-col items-start md:items-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border)]">
                        <div>
                          <p className={`text-2xl font-bold ${isLowest ? "text-farenheit-500" : ""}`}>
                            {formatPrice(offer.price_amount, offer.currency)}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            1인 {isRoundTrip ? "왕복" : "편도"}
                          </p>
                        </div>
                        <a
                          href={buildBookingUrl(originCode, destCode, String(offer.departure_date), isRoundTrip && offer.return_date ? String(offer.return_date) : null, offer.cabin_class, maxStops === "0")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-farenheit-500 text-white hover:bg-farenheit-600 hover:shadow-md transition-all"
                        >
                          예약하기
                          <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
              {filteredOffers.length > 100 && (
                <p className="text-center text-sm text-[var(--muted-foreground)] py-4">
                  상위 100개 결과를 표시하고 있습니다. 필터를 조정하여 결과를 좁혀보세요.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Initial State */}
      {!isLoading && !searched && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <svg aria-hidden="true" className="w-12 h-12 mx-auto mb-4 text-farenheit-300 dark:text-farenheit-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
          <p className="text-lg mb-2 text-[var(--foreground)]">출발지, 도착지, 날짜를 입력하고 검색하세요</p>
          <p className="text-sm">전 세계 항공편 가격을 실시간으로 검색합니다</p>
          <div className="flex items-center justify-center gap-4 mt-6 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Travelpayouts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              AirLabs
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-8 w-32 bg-[var(--muted)] rounded animate-pulse" />
        <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-[var(--muted)] rounded-lg animate-pulse" />)}
          </div>
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}

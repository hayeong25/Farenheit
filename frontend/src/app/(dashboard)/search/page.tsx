"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";
import Link from "next/link";
import { flightsApi, FlightOffer, AirlineInfo, PriceHistoryResponse, routesApi } from "@/lib/api-client";
import { formatPrice, saveRecentSearch, getLocalToday, getDateOneYearLater, VALID_CABIN_CLASSES, CABIN_CLASS_LABELS, SAME_ORIGIN_DEST_MSG } from "@/lib/utils";

const VALID_STOPS = ["any", "0", "1", "2"];
const VALID_SORTS = ["price", "price_desc", "duration", "stops"];

function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "-";
  if (minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function formatDateKr(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
  } catch {
    return dateStr;
  }
}

function getStopsLabel(stops: number): string {
  if (stops === 0) return "직항";
  return `경유 ${stops}회`;
}

function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "-";
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
      setError("서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도해주세요.");
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

  const { minPrice, directCount } = useMemo(() => {
    let min = 0;
    let directs = 0;
    for (const o of filteredOffers) {
      if (o.price_amount > 0 && (min === 0 || o.price_amount < min)) min = o.price_amount;
      if (o.stops === 0) directs++;
    }
    return { minPrice: min, directCount: directs };
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
            className="md:hidden w-full py-2 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--muted)] hover:bg-farenheit-50 transition-colors disabled:opacity-30 text-sm text-[var(--muted-foreground)]"
          >
            <svg className="w-4 h-4 rotate-90 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            출발지/도착지 바꾸기
          </button>
        </div>

        {/* Row 2: Dates + Cabin + Search */}
        <div className={`grid grid-cols-1 gap-4 ${
          tripType === "round_trip" ? "md:grid-cols-4" : "md:grid-cols-3"
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
                const missing: string[] = [];
                if (!originCode) missing.push("출발지");
                if (!destCode) missing.push("도착지");
                if (!date) missing.push("출발일");
                if (tripType === "round_trip" && !returnDate) missing.push("귀국일");
                if (missing.length > 0) {
                  setValidationMsg(`${missing.join(", ")}을(를) 입력해주세요.`);
                  return;
                }
                if (tripType === "round_trip" && returnDate && returnDate < date) {
                  setValidationMsg("귀국일은 출발일 이후여야 합니다.");
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
              className="w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "검색 중..." : "검색"}
            </button>
            {validationMsg && (
              <p role="alert" className="text-xs text-red-500 mt-1">{validationMsg}</p>
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
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center">
          <div className="inline-block w-8 h-8 border-4 border-farenheit-200 border-t-farenheit-500 rounded-full animate-spin mb-4" />
          <p className="text-[var(--muted-foreground)]">실시간 항공편을 검색하고 있습니다...</p>
        </div>
      )}

      {/* Results */}
      {!isLoading && searched && (
        <div className="space-y-4" aria-live="polite">
          {/* Result Header + Filters */}
          <div className="bg-[var(--background)] rounded-xl p-4 border border-[var(--border)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold min-w-0">
                  검색 결과
                  {searchInfo && (
                    <span className="text-sm font-normal text-[var(--muted-foreground)] ml-2 break-words">
                      {searchInfo.origin} → {searchInfo.dest}
                      {isRoundTrip ? " (왕복)" : " (편도)"}
                      {" | "}
                      {formatDateKr(searchInfo.date)}
                      {searchInfo.returnDate && ` ~ ${formatDateKr(searchInfo.returnDate)}`}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {filteredOffers.length}개 항공편
                  {filteredOffers.length !== offers.length && ` (전체 ${offers.length}개 중)`}
                  {directCount > 0 && ` | 직항 ${directCount}개`}
                  {minPrice > 0 && ` | 최저가 ${formatPrice(minPrice)}`}
                </p>
                {dataSource === "cached" && (
                  <p className="text-xs text-yellow-600 mt-0.5">
                    실시간 조회 실패 — 이전에 수집된 캐시 데이터입니다
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
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
          </div>

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
                          ? "border-farenheit-400 bg-farenheit-50 text-farenheit-700 shadow-sm"
                          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-gray-400"
                      }`}
                    >
                      <span className={`flex items-center justify-center w-4 h-4 rounded border transition-colors ${
                        checked
                          ? "bg-farenheit-500 border-farenheit-500"
                          : "border-gray-300 bg-[var(--background)]"
                      }`}>
                        {checked && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
                    className="px-5 py-2 rounded-lg border border-farenheit-500 text-farenheit-500 text-sm font-medium hover:bg-farenheit-50 transition-colors"
                  >
                    필터 초기화
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOffers.slice(0, 100).map((offer, idx) => {
                const isLowest = minPrice > 0 && offer.price_amount === minPrice;
                const offerKey = `${offer.airline_code}-${offer.flight_number || ""}-${offer.departure_date}-${offer.stops}-${offer.price_amount}-${idx}`;
                return (
                  <div
                    key={offerKey}
                    className={`bg-[var(--background)] rounded-xl p-5 border transition-shadow hover:shadow-md ${
                      isLowest ? "border-farenheit-300 ring-1 ring-farenheit-100" : "border-[var(--border)]"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Flight Info */}
                      <div className="flex-1 space-y-3">
                        {/* Airline header */}
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-bold text-lg truncate max-w-[140px] sm:max-w-[200px]">{offer.airline_name || offer.airline_code}</span>
                          {isLowest && (
                            <span className="text-xs px-2 py-0.5 rounded bg-farenheit-50 text-farenheit-600 font-medium">
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
                        <div className="flex items-center gap-4 text-sm flex-wrap">
                          <span className="text-xs font-medium text-[var(--muted-foreground)] w-12">
                            {isRoundTrip ? "가는편" : ""}
                          </span>
                          {offer.flight_number && (
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                              {offer.flight_number}
                            </span>
                          )}
                          <span className="font-semibold">{formatTime(offer.departure_time)}</span>
                          <span className="text-[var(--muted-foreground)]">&rarr;</span>
                          <span className="font-semibold">{formatTime(offer.arrival_time)}</span>
                          <span className="text-[var(--muted-foreground)]">{formatDuration(offer.duration_minutes)}</span>
                          <span className="text-[var(--muted-foreground)]">{getStopsLabel(offer.stops)}</span>
                        </div>

                        {/* Return leg (round-trip only) */}
                        {isRoundTrip && (
                          <div className="flex items-center gap-4 text-sm flex-wrap">
                            <span className="text-xs font-medium text-[var(--muted-foreground)] w-12">오는편</span>
                            {offer.return_departure_time ? (
                              <>
                                {offer.return_flight_number && (
                                  <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                                    {offer.return_flight_number}
                                  </span>
                                )}
                                <span className="font-semibold">{formatTime(offer.return_departure_time)}</span>
                                <span className="text-[var(--muted-foreground)]">&rarr;</span>
                                <span className="font-semibold">{formatTime(offer.return_arrival_time)}</span>
                                <span className="text-[var(--muted-foreground)]">{formatDuration(offer.return_duration_minutes)}</span>
                                <span className="text-[var(--muted-foreground)]">
                                  {offer.return_stops != null ? getStopsLabel(offer.return_stops) : ""}
                                </span>
                              </>
                            ) : (
                              <span className="text-[var(--muted-foreground)] italic">귀국편 상세 정보는 예약 시 확인 가능</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Price + Booking */}
                      <div className="text-right md:min-w-[140px] flex-shrink-0 flex flex-col items-end gap-2">
                        <div>
                          <p className={`text-2xl font-bold ${isLowest ? "text-farenheit-500" : ""}`}>
                            {formatPrice(offer.price_amount, offer.currency)}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            1인 {isRoundTrip ? "왕복" : "편도"}
                          </p>
                        </div>
                        <a
                          href={`https://www.google.com/travel/flights?q=${encodeURIComponent(`flights ${originCode} to ${destCode} on ${offer.departure_date}${isRoundTrip && offer.return_date ? ` return ${offer.return_date}` : ""}`)}&curr=KRW`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-farenheit-500 text-white hover:bg-farenheit-600 transition-colors"
                        >
                          예약하기
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>
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

      {/* Price History Summary */}
      {!isLoading && searched && priceHistory && priceHistory.prices.length > 0 && priceHistory.min_price != null && minPrice > 0 && (
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <h3 className="text-sm font-semibold mb-3">이 노선 가격 추이 (최근 30일)</h3>
          {(() => {
            const minP = Number(priceHistory.min_price);
            const avgP = Number(priceHistory.avg_price);
            const maxP = Number(priceHistory.max_price);
            return (
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs text-[var(--muted-foreground)]">최저가</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatPrice(Math.round(minP))}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted-foreground)]">평균가</p>
                  <p className="text-lg font-bold">{formatPrice(Math.round(avgP))}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted-foreground)]">최고가</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatPrice(Math.round(maxP))}</p>
                </div>
              </div>
            );
          })()}
          {/* Simple sparkline visualization */}
          {(() => {
            const prices = priceHistory.prices.map(p => Number(p.price_amount)).filter(p => Number.isFinite(p) && p > 0);
            if (prices.length === 0) return null;
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            const range = max - min || 1;
            const currentMin = minPrice;
            const avgNum = Number(priceHistory.avg_price);
            if (!Number.isFinite(avgNum)) return null;
            const position = avgNum > 0 ? ((currentMin - min) / range) * 100 : 50;
            const isGoodPrice = currentMin <= avgNum;
            return (
              <div>
                <div className="relative h-2 rounded-full bg-gradient-to-r from-green-200 via-yellow-200 to-red-200">
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
        </div>
      )}

      {/* Quick Actions after search */}
      {!isLoading && searched && filteredOffers.length > 0 && originCode && destCode && date && (
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm font-medium mb-3">다음 단계</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link
              href={`/predictions?${new URLSearchParams({ origin: originCode, dest: destCode, date, ...(cabinClass !== "ECONOMY" ? { cabin: cabinClass } : {}) }).toString()}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:border-farenheit-300 hover:bg-farenheit-50 transition-all"
            >
              <svg className="w-5 h-5 text-farenheit-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
              <div>
                <p className="text-sm font-medium">가격 예측 보기</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">앞으로 가격이 어떻게 변할지 확인</p>
              </div>
            </Link>
            <Link
              href={`/recommendations?${new URLSearchParams({ origin: originCode, dest: destCode, date, ...(cabinClass !== "ECONOMY" ? { cabin: cabinClass } : {}) }).toString()}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:border-farenheit-300 hover:bg-farenheit-50 transition-all"
            >
              <svg className="w-5 h-5 text-farenheit-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
              </svg>
              <div>
                <p className="text-sm font-medium">구매 추천 받기</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">지금 살지, 기다릴지 AI가 분석</p>
              </div>
            </Link>
            <Link
              href={`/alerts?${new URLSearchParams({ origin: originCode, dest: destCode, date, ...(minPrice > 0 ? { target: String(Math.round(minPrice)) } : {}) }).toString()}`}
              className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border)] hover:border-farenheit-300 hover:bg-farenheit-50 transition-all"
            >
              <svg className="w-5 h-5 text-farenheit-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              <div>
                <p className="text-sm font-medium">가격 알림 설정</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">목표가에 도달하면 알려드립니다</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Initial State */}
      {!isLoading && !searched && (
        <div className="bg-[var(--background)] rounded-xl p-12 border border-[var(--border)] text-center text-[var(--muted-foreground)]">
          <svg className="w-12 h-12 mx-auto mb-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
          <p className="text-lg mb-2">출발지, 도착지, 날짜를 입력하고 검색하세요</p>
          <p className="text-sm">전 세계 항공편 가격을 실시간으로 검색합니다</p>
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

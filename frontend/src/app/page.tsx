"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { routesApi, type RouteResponse } from "@/lib/api-client";
import { getRecentSearches, getLocalToday, getDefaultSearchDate, getDateOneYearLater, formatPrice, getMissingFieldsMsg, VALID_CABIN_CLASSES, CABIN_CLASS_LABELS, SAME_ORIGIN_DEST_MSG, RETURN_BEFORE_DEPART_MSG, RETURN_DATE_RESET_MSG, type RecentSearch } from "@/lib/utils";

export default function HomePage() {
  const router = useRouter();
  const [originCode, setOriginCode] = useState("");
  const [originDisplay, setOriginDisplay] = useState("");
  const [destCode, setDestCode] = useState("");
  const [destDisplay, setDestDisplay] = useState("");
  const [date, setDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [tripType, setTripType] = useState<"round_trip" | "one_way">("round_trip");
  const [cabinClass, setCabinClass] = useState("ECONOMY");
  const [isSearching, setIsSearching] = useState(false);

  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [popularRoutes, setPopularRoutes] = useState<RouteResponse[]>([]);
  const [validationMsg, setValidationMsg] = useState("");
  const validationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showValidation = useCallback((msg: string) => {
    setValidationMsg(msg);
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
    validationTimerRef.current = setTimeout(() => setValidationMsg(""), 5000);
  }, []);

  // Set default date + initialize client state (once only)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    setDate(getDefaultSearchDate());
    setRecentSearches(getRecentSearches());
    setIsSearching(false);
    routesApi.popular(8).then((routes) => setPopularRoutes(routes)).catch(() => { /* non-critical */ });
    const handleVisibility = () => {
      if (document.visibilityState === "visible") setIsSearching(false);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs for resetting AirportSearch components
  const originKeyRef = useRef(0);
  const destKeyRef = useRef(0);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSearching) return;

    const missingMsg = getMissingFieldsMsg(originCode, destCode, date, { tripType, returnDate });
    if (missingMsg) {
      showValidation(missingMsg);
      return;
    }
    if (tripType === "round_trip" && returnDate && returnDate < date) {
      showValidation(RETURN_BEFORE_DEPART_MSG);
      return;
    }
    if (originCode === destCode) {
      showValidation(SAME_ORIGIN_DEST_MSG);
      return;
    }
    setValidationMsg("");
    setIsSearching(true);

    const params = new URLSearchParams({ origin: originCode, dest: destCode, date });
    if (tripType === "round_trip" && returnDate) params.set("return_date", returnDate);
    if (cabinClass !== "ECONOMY") params.set("cabin", cabinClass);
    router.push(`/search?${params.toString()}`);
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold">
            <span className="text-farenheit-500">Faren</span>
            <span>heit</span>
          </h1>
        </div>
      </header>

      {/* Main - 2 column layout */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-start">
          {/* Left: Illustration + Search */}
          <div>
            {/* Hero Illustration */}
            <div className="flex items-center justify-center gap-6 mb-6">
              {/* Thermometer */}
              <div className="relative w-14 h-32 md:w-16 md:h-36">
                <svg aria-hidden="true" viewBox="0 0 80 176" fill="none" className="w-full h-full">
                  <rect x="24" y="8" width="32" height="120" rx="16" className="stroke-farenheit-300 dark:stroke-farenheit-700" strokeWidth="3" fill="none" />
                  <rect x="32" y="48" width="16" height="72" rx="8" className="fill-farenheit-500">
                    <animate attributeName="y" values="80;48;64;48" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="height" values="40;72;56;72" dur="3s" repeatCount="indefinite" />
                  </rect>
                  <circle cx="40" cy="148" r="22" className="fill-farenheit-500" />
                  <circle cx="40" cy="148" r="16" className="fill-farenheit-400" opacity="0.6" />
                  <line x1="58" y1="40" x2="66" y2="40" className="stroke-[var(--muted-foreground)]" strokeWidth="1.5" opacity="0.4" />
                  <line x1="58" y1="60" x2="66" y2="60" className="stroke-[var(--muted-foreground)]" strokeWidth="1.5" opacity="0.4" />
                  <line x1="58" y1="80" x2="66" y2="80" className="stroke-[var(--muted-foreground)]" strokeWidth="1.5" opacity="0.4" />
                  <line x1="58" y1="100" x2="66" y2="100" className="stroke-[var(--muted-foreground)]" strokeWidth="1.5" opacity="0.4" />
                </svg>
              </div>
              {/* Plane + Price Tags */}
              <div className="flex flex-col items-start gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">BUY</span>
                </div>
                <svg aria-hidden="true" viewBox="0 0 120 40" className="w-28 md:w-32 text-farenheit-500">
                  <path d="M10 30 Q30 10 50 20 T90 12 L110 8" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round">
                    <animate attributeName="d" values="M10 30 Q30 10 50 20 T90 12 L110 8;M10 25 Q30 18 50 28 T90 15 L110 10;M10 30 Q30 10 50 20 T90 12 L110 8" dur="4s" repeatCount="indefinite" />
                  </path>
                  <g transform="translate(104, 4)">
                    <path d="M0 6 L6 0 L14 4 L6 6 L14 8 L6 12 L0 6Z" fill="currentColor" opacity="0.8">
                      <animateTransform attributeName="transform" type="translate" values="0,0;2,-2;0,0" dur="4s" repeatCount="indefinite" />
                    </path>
                  </g>
                </svg>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">WAIT</span>
                </div>
              </div>
            </div>
            <p className="text-[var(--muted-foreground)] mb-6 text-sm text-center">
              지금이 살 때인지, 기다려야 할 때인지 알려드립니다
            </p>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="bg-[var(--muted)] rounded-2xl p-6">
              {/* Trip Type Toggle */}
              <div className="flex gap-1 mb-4 bg-[var(--background)] rounded-lg p-1 w-fit mx-auto">
                <button
                  type="button"
                  onClick={() => setTripType("round_trip")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-farenheit-500 ${
                    tripType === "round_trip"
                      ? "bg-farenheit-500 text-white shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  왕복
                </button>
                <button
                  type="button"
                  onClick={() => { setTripType("one_way"); setReturnDate(""); }}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-farenheit-500 ${
                    tripType === "one_way"
                      ? "bg-farenheit-500 text-white shadow-sm"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  편도
                </button>
              </div>

              {/* Origin / Swap / Destination */}
              <div className="grid grid-cols-1 gap-2 mb-4">
                <AirportSearch
                  key={`origin-${originKeyRef.current}`}
                  label="출발지"
                  placeholder="도시 또는 공항 검색"
                  value={originDisplay}
                  onSelect={(code, display) => { setOriginCode(code); setOriginDisplay(display || ""); setValidationMsg(""); }}
                />
                <button
                  type="button"
                  onClick={handleSwap}
                  disabled={!originCode || !destCode}
                  aria-label="출발지와 도착지 바꾸기"
                  className="w-full py-1.5 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-farenheit-50 dark:hover:bg-farenheit-950 transition-colors disabled:opacity-30 text-sm text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                >
                  <svg aria-hidden="true" className="w-4 h-4 rotate-90 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  출발지/도착지 바꾸기
                </button>
                <AirportSearch
                  key={`dest-${destKeyRef.current}`}
                  label="도착지"
                  placeholder="도시 또는 공항 검색"
                  value={destDisplay}
                  onSelect={(code, display) => { setDestCode(code); setDestDisplay(display || ""); setValidationMsg(""); }}
                />
              </div>

              <div className={`grid grid-cols-1 gap-4 mb-4 ${
                tripType === "round_trip" ? "sm:grid-cols-3" : "sm:grid-cols-2"
              }`}>
                <div>
                  <label htmlFor="home-departure-date" className="block text-sm font-medium mb-1 text-left">출발일</label>
                  <input
                    id="home-departure-date"
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setValidationMsg("");
                      if (returnDate && e.target.value > returnDate) {
                        setReturnDate("");
                        showValidation(RETURN_DATE_RESET_MSG);
                      }
                    }}
                    min={getLocalToday()}
                    max={getDateOneYearLater()}
                    className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                  />
                </div>
                {tripType === "round_trip" && (
                  <div>
                    <label htmlFor="home-return-date" className="block text-sm font-medium mb-1 text-left">귀국일</label>
                    <input
                      id="home-return-date"
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
                  <label htmlFor="home-cabin-class" className="block text-sm font-medium mb-1 text-left">좌석 등급</label>
                  <select
                    id="home-cabin-class"
                    value={cabinClass}
                    onChange={(e) => setCabinClass(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                  >
                    {VALID_CABIN_CLASSES.map((c) => (
                      <option key={c} value={c}>{CABIN_CLASS_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className={`block w-full py-3 rounded-lg font-semibold transition-all text-center focus:outline-none focus:ring-2 focus:ring-farenheit-500 focus:ring-offset-2 ${
                  isSearching
                    ? "bg-farenheit-400 text-white/80 cursor-wait"
                    : "bg-farenheit-500 text-white hover:bg-farenheit-600 hover:shadow-lg hover:shadow-farenheit-500/25 active:scale-[0.98]"
                }`}
              >
                {isSearching ? (
                  <span className="inline-flex items-center gap-2">
                    <svg aria-hidden="true" className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                      <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    검색 중...
                  </span>
                ) : (
                  "가격 분석하기"
                )}
              </button>
              {validationMsg && (
                <div role="alert" className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400">
                  <svg aria-hidden="true" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
                  </svg>
                  <p className="text-sm font-medium">{validationMsg}</p>
                </div>
              )}
            </form>
          </div>

          {/* Right: Recent Searches + Popular Routes */}
          <div className="space-y-8">
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg aria-hidden="true" className="w-5 h-5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  최근 검색
                </h2>
                <div className="space-y-2 animate-stagger">
                  {recentSearches.slice(0, 5).map((s) => {
                    const today = getLocalToday();
                    const searchDate = s.date >= today ? s.date : getDefaultSearchDate();
                    const searchReturnDate = s.returnDate && s.returnDate >= searchDate ? s.returnDate : undefined;
                    return (
                      <Link
                        key={`${s.origin}-${s.dest}-${s.date}`}
                        href={(() => {
                          const p = new URLSearchParams({ origin: s.origin, dest: s.dest, date: searchDate });
                          if (searchReturnDate) p.set("return_date", searchReturnDate);
                          if (s.cabinClass !== "ECONOMY") p.set("cabin", s.cabinClass);
                          return `/search?${p.toString()}`;
                        })()}
                        className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 dark:hover:border-farenheit-700 hover:bg-farenheit-50 dark:hover:bg-farenheit-950 hover:-translate-y-0.5 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{s.originDisplay} → {s.destDisplay}</p>
                          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                            {searchDate.slice(5).replace("-", ".")}{searchReturnDate ? ` ~ ${searchReturnDate.slice(5).replace("-", ".")}` : ""}
                          </p>
                        </div>
                        {s.minPrice != null && s.minPrice > 0 && (
                          <span className="text-sm font-semibold text-farenheit-500 ml-3 shrink-0">{formatPrice(Math.round(s.minPrice))}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Popular Routes */}
            {popularRoutes.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg aria-hidden="true" className="w-5 h-5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  </svg>
                  인기 노선
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {popularRoutes.map((route) => (
                    <Link
                      key={route.id}
                      href={`/search?${new URLSearchParams({ origin: route.origin_code, dest: route.dest_code, date: getDefaultSearchDate() }).toString()}`}
                      className="group flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 dark:hover:border-farenheit-700 hover:bg-farenheit-50 dark:hover:bg-farenheit-950 transition-all focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                    >
                      <svg aria-hidden="true" className="w-4 h-4 text-farenheit-400 shrink-0 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {route.origin_city || route.origin_code} → {route.dest_city || route.dest_code}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {route.origin_code} - {route.dest_code}
                        </p>
                      </div>
                      {route.min_price != null && route.min_price > 0 && (
                        <span className="text-xs font-semibold text-farenheit-500 shrink-0">{formatPrice(Math.round(route.min_price))}</span>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state when no data */}
            {recentSearches.length === 0 && popularRoutes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg aria-hidden="true" className="w-12 h-12 text-[var(--muted-foreground)] opacity-30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p className="text-sm text-[var(--muted-foreground)]">검색을 시작해보세요</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Features */}
      <section className="border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center animate-stagger">
            <div>
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-farenheit-50 dark:bg-farenheit-950 flex items-center justify-center">
                <svg aria-hidden="true" className="w-5 h-5 text-farenheit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
              </div>
              <p className="text-sm font-medium">가격 예측</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">과거 데이터 기반 가격 변동 예측</p>
            </div>
            <div>
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center">
                <svg aria-hidden="true" className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                </svg>
              </div>
              <p className="text-sm font-medium">구매 추천</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">BUY / WAIT / HOLD 시그널 분석</p>
            </div>
            <div>
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-yellow-50 dark:bg-yellow-950/30 flex items-center justify-center">
                <svg aria-hidden="true" className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                </svg>
              </div>
              <p className="text-sm font-medium">가격 알림</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">목표가 도달 시 자동 알림</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-center gap-2 text-sm text-[var(--muted-foreground)]">
          <span className="text-farenheit-400 font-bold text-base">F</span>
          <span>Farenheit &mdash; Fare + Fahrenheit</span>
        </div>
      </footer>
    </div>
  );
}

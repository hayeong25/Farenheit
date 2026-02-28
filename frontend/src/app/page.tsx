"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";
import { getRecentSearches, type RecentSearch } from "@/lib/utils";

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
  const [validationMsg, setValidationMsg] = useState("");
  const validationTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showValidation = useCallback((msg: string) => {
    setValidationMsg(msg);
    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
    validationTimerRef.current = setTimeout(() => setValidationMsg(""), 5000);
  }, []);

  // Set default date (14 days from now) on client to avoid hydration mismatch
  useEffect(() => {
    if (!date) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      setDate(d.toLocaleDateString("sv-SE"));
    }
    setRecentSearches(getRecentSearches());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs for resetting AirportSearch components
  const originKeyRef = useRef(0);
  const destKeyRef = useRef(0);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSearching) return;

    const missing: string[] = [];
    if (!originCode) missing.push("출발지");
    if (!destCode) missing.push("도착지");
    if (!date) missing.push("출발일");
    if (tripType === "round_trip" && !returnDate) missing.push("귀국일");
    if (missing.length > 0) {
      showValidation(`${missing.join(", ")}을(를) 입력해주세요.`);
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
    // Force re-render of AirportSearch components
    originKeyRef.current += 1;
    destKeyRef.current += 1;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            <span className="text-farenheit-500">Faren</span>
            <span>heit</span>
          </h1>
          <nav className="flex gap-4">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-lg bg-farenheit-500 text-white hover:bg-farenheit-600 transition-colors text-sm font-medium"
            >
              대시보드
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            항공권 가격의
            <br />
            <span className="text-farenheit-500">온도</span>를 측정하다
          </h2>
          <p className="text-lg md:text-xl text-[var(--muted-foreground)] mb-8 leading-relaxed">
            실시간 가격 분석과 AI 예측으로
            <br />
            최적의 항공권 구매 시기를 추천합니다
          </p>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="bg-[var(--muted)] rounded-2xl p-6 max-w-2xl mx-auto">
            {/* Trip Type Toggle */}
            <div className="flex gap-1 mb-4 bg-[var(--background)] rounded-lg p-1 w-fit mx-auto">
              <button
                type="button"
                onClick={() => setTripType("round_trip")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tripType === "one_way"
                    ? "bg-farenheit-500 text-white shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                편도
              </button>
            </div>

            {/* Origin / Swap / Destination */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2 md:gap-0 mb-4 items-end">
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
                disabled={!originCode && !destCode}
                className="hidden md:flex w-10 h-10 mx-1 mb-0.5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] hover:bg-farenheit-50 hover:border-farenheit-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-end"
                title="출발지/도착지 바꾸기"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M7 16l-4-4m0 0l4-4m-4 4h18M17 8l4 4m0 0l-4 4m4-4H3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleSwap}
                disabled={!originCode && !destCode}
                className="md:hidden w-full py-2 flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-farenheit-50 transition-colors disabled:opacity-30 text-sm text-[var(--muted-foreground)]"
              >
                <svg className="w-4 h-4 rotate-90 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
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
              tripType === "round_trip" ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}>
              <div>
                <label className="block text-sm font-medium mb-1 text-left">출발일</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setValidationMsg("");
                    if (returnDate && e.target.value > returnDate) {
                      setReturnDate("");
                      showValidation("출발일이 귀국일보다 늦어 귀국일이 초기화되었습니다.");
                    }
                  }}
                  min={new Date().toLocaleDateString("sv-SE")}
                  className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                />
              </div>
              {tripType === "round_trip" && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-left">귀국일</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => { setReturnDate(e.target.value); setValidationMsg(""); }}
                    min={date || new Date().toLocaleDateString("sv-SE")}
                    className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-left">좌석 등급</label>
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
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className={`block w-full py-3 rounded-lg font-semibold transition-colors text-center ${
                isSearching
                  ? "bg-farenheit-400 text-white/80 cursor-wait"
                  : "bg-farenheit-500 text-white hover:bg-farenheit-600"
              }`}
            >
              {isSearching ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
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
              <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-600">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
                </svg>
                <p className="text-sm font-medium">{validationMsg}</p>
              </div>
            )}
          </form>

          {/* Recent Searches for returning users */}
          {recentSearches.length > 0 && (
            <div className="mt-8 max-w-2xl mx-auto">
              <p className="text-sm text-[var(--muted-foreground)] mb-3">최근 검색</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {recentSearches.slice(0, 4).map((s, i) => (
                  <Link
                    key={i}
                    href={`/search?origin=${s.origin}&dest=${s.dest}&date=${s.date}${s.returnDate ? `&return_date=${s.returnDate}` : ""}${s.cabinClass !== "ECONOMY" ? `&cabin=${s.cabinClass}` : ""}`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--background)] hover:border-farenheit-300 hover:bg-farenheit-50 transition-all text-sm"
                  >
                    <span className="font-medium">{s.originDisplay} → {s.destDisplay}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {s.date.slice(5)}{s.returnDate ? ` ~ ${s.returnDate.slice(5)}` : ""}
                    </span>
                    {s.minPrice && (
                      <span className="text-xs text-farenheit-500">₩{Math.round(s.minPrice).toLocaleString()}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            <div>
              <div className="w-12 h-12 rounded-xl bg-farenheit-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-farenheit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg mb-2">실시간 가격 추적</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                전 세계 항공사 가격을 실시간으로 수집하고 추적합니다
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-xl bg-farenheit-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-farenheit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg mb-2">AI 가격 예측</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                통계 모델로 가격 변동 추세를 분석하고 예측합니다
              </p>
            </div>
            <div>
              <div className="w-12 h-12 rounded-xl bg-farenheit-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-farenheit-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg mb-2">최적 시기 추천</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                BUY / WAIT / HOLD 시그널로 구매 타이밍을 알려드립니다
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-6">
        <div className="max-w-7xl mx-auto px-6 text-center text-sm text-[var(--muted-foreground)]">
          Farenheit &mdash; Fare + Fahrenheit. 가격의 온도를 측정합니다.
        </div>
      </footer>
    </div>
  );
}

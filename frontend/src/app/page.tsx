"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AirportSearch } from "@/components/flights/AirportSearch";

export default function HomePage() {
  const router = useRouter();
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [date, setDate] = useState("");

  const handleSearch = () => {
    if (originCode && destCode && date) {
      router.push(`/search?origin=${originCode}&dest=${destCode}&date=${date}`);
    }
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
              className="px-4 py-2 rounded-lg bg-farenheit-500 text-white hover:bg-farenheit-600 transition-colors"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-5xl font-bold mb-4 tracking-tight">
            항공권 가격의
            <br />
            <span className="text-farenheit-500">온도</span>를 측정하다
          </h2>
          <p className="text-xl text-[var(--muted-foreground)] mb-8 leading-relaxed">
            실시간 가격 분석과 AI 예측으로
            <br />
            최적의 항공권 구매 시기를 추천합니다
          </p>

          {/* Search Form */}
          <div className="bg-[var(--muted)] rounded-2xl p-6 max-w-2xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <AirportSearch
                label="출발지"
                placeholder="도시 또는 공항 검색"
                value=""
                onSelect={(code) => setOriginCode(code)}
              />
              <AirportSearch
                label="도착지"
                placeholder="도시 또는 공항 검색"
                value=""
                onSelect={(code) => setDestCode(code)}
              />
              <div>
                <label className="block text-sm font-medium mb-1 text-left">출발일</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                />
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={!originCode || !destCode || !date}
              className="block w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              가격 분석하기
            </button>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            <div>
              <div className="text-3xl mb-3">📊</div>
              <h3 className="font-semibold text-lg mb-2">실시간 가격 추적</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                전 세계 항공사 가격을 실시간으로 수집하고 추적합니다
              </p>
            </div>
            <div>
              <div className="text-3xl mb-3">🤖</div>
              <h3 className="font-semibold text-lg mb-2">AI 가격 예측</h3>
              <p className="text-[var(--muted-foreground)] text-sm">
                머신러닝 앙상블 모델로 가격 변동을 예측합니다
              </p>
            </div>
            <div>
              <div className="text-3xl mb-3">🎯</div>
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
          Farenheit — Fare + Fahrenheit. 가격의 온도를 측정합니다.
        </div>
      </footer>
    </div>
  );
}

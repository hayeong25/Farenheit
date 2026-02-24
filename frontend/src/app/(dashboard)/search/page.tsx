"use client";

import { useState } from "react";

export default function SearchPage() {
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [date, setDate] = useState("");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Flight Search</h1>

      {/* Search Form */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">출발지 (IATA)</label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value.toUpperCase())}
              placeholder="ICN"
              maxLength={3}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">도착지 (IATA)</label>
            <input
              type="text"
              value={dest}
              onChange={(e) => setDest(e.target.value.toUpperCase())}
              placeholder="NRT"
              maxLength={3}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">출발일</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div className="flex items-end">
            <button className="w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors">
              검색
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">검색 결과</h2>
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p>출발지, 도착지, 출발일을 입력하고 검색하세요.</p>
        </div>
      </div>
    </div>
  );
}

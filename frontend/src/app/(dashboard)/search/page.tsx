"use client";

import { useState } from "react";
import { AirportSearch } from "@/components/flights/AirportSearch";

export default function SearchPage() {
  const [originCode, setOriginCode] = useState("");
  const [destCode, setDestCode] = useState("");
  const [date, setDate] = useState("");

  const handleSearch = () => {
    if (originCode && destCode && date) {
      // TODO: Call search API
      console.log("Search:", originCode, destCode, date);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Flight Search</h1>

      {/* Search Form */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <label className="block text-sm font-medium mb-1">출발일</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSearch}
              disabled={!originCode || !destCode || !date}
              className="w-full py-3 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
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

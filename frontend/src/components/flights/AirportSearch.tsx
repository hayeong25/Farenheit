"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Airport {
  iata_code: string;
  name: string;
  city: string;
  city_ko: string | null;
  country_code: string;
}

interface AirportSearchProps {
  label: string;
  placeholder: string;
  value: string;
  onSelect: (iataCode: string, displayName: string) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

export function AirportSearch({ label, placeholder, value, onSelect }: AirportSearchProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Airport[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCode, setSelectedCode] = useState(value ? "" : "");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (value && value !== query) setQuery(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchAirports = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/routes/airports/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data: Airport[] = await res.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setHighlightIdx(-1);
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (selectedCode) {
      setSelectedCode("");
      onSelect("", "");
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAirports(val), 200);
  };

  const handleSelect = (airport: Airport) => {
    const displayName = airport.city_ko
      ? `${airport.city_ko} (${airport.iata_code})`
      : `${airport.city} (${airport.iata_code})`;
    setQuery(displayName);
    setSelectedCode(airport.iata_code);
    onSelect(airport.iata_code, displayName);
    setIsOpen(false);
    setHighlightIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIdx]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium mb-1 text-left">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0 && !selectedCode) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full px-4 py-3 rounded-lg border bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500 transition-colors ${
            selectedCode ? "border-farenheit-300" : "border-[var(--border)]"
          }`}
        />
        {selectedCode && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedCode("");
              setResults([]);
              onSelect("", "");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-sm p-1"
            aria-label="선택 취소"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <ul className="absolute z-50 w-full mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
            <li className="px-4 py-3 text-sm text-[var(--muted-foreground)]">검색 중...</li>
          ) : results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--muted-foreground)]">결과가 없습니다</li>
          ) : (
            results.map((airport, idx) => (
              <li
                key={airport.iata_code}
                onClick={() => handleSelect(airport)}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  idx === highlightIdx
                    ? "bg-farenheit-50 text-farenheit-700"
                    : "hover:bg-[var(--muted)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={`https://flagcdn.com/w40/${airport.country_code.toLowerCase()}.png`}
                    srcSet={`https://flagcdn.com/w80/${airport.country_code.toLowerCase()}.png 2x`}
                    alt={airport.country_code}
                    className="w-7 h-5 object-cover rounded-sm shrink-0"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">
                          {airport.city_ko || airport.city}
                        </span>
                        <span className="text-[var(--muted-foreground)] text-sm ml-2">
                          {airport.city_ko ? airport.city : ""}
                        </span>
                      </div>
                      <span className="text-sm font-mono text-[var(--muted-foreground)] ml-2">
                        {airport.iata_code}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">{airport.name}</p>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

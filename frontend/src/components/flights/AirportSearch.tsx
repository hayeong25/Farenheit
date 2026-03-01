"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";

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
  const [fetchError, setFetchError] = useState(false);
  const [selectedCode, setSelectedCode] = useState(value || "");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const instanceId = useId();
  const inputId = `airport-input-${instanceId}`;
  const listboxId = `airport-listbox-${instanceId}`;

  useEffect(() => {
    if (value !== query) setQuery(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      // Cleanup on unmount: abort in-flight requests and clear debounce
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const searchAirports = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    // Cancel previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setFetchError(false);
    try {
      const res = await fetch(`${API_BASE}/routes/airports/search?${new URLSearchParams({ q })}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data: Airport[] = await res.json();
        setResults(data.slice(0, 15));
        setIsOpen(true);
        setHighlightIdx(-1);
      } else {
        setResults([]);
        setFetchError(true);
        setIsOpen(true);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setResults([]);
      setFetchError(true);
      setIsOpen(true);
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  const composingRef = useRef(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (selectedCode) {
      setSelectedCode("");
      onSelect("", "");
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Don't search during IME composition (Korean input)
    if (!composingRef.current) {
      debounceRef.current = setTimeout(() => searchAirports(val), 250);
    }
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
    } else if (e.key === "Escape" || e.key === "Tab") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label htmlFor={inputId} className="block text-sm font-medium mb-1 text-left">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={highlightIdx >= 0 ? `${listboxId}-option-${highlightIdx}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0 && !selectedCode && query.length >= 2) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            // Trigger search after composition ends
            const val = (e.target as HTMLInputElement).value;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => searchAirports(val), 250);
          }}
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
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-sm p-2"
            aria-label="선택 취소"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && (
        <ul id={listboxId} role="listbox" aria-label={label} className="absolute z-[60] w-full mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
            <li className="px-4 py-3 text-sm text-[var(--muted-foreground)]">검색 중...</li>
          ) : fetchError ? (
            <li className="px-4 py-3 text-sm text-red-500">서버 연결에 실패했습니다. 다시 입력해주세요.</li>
          ) : results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--muted-foreground)]">결과가 없습니다</li>
          ) : (
            results.map((airport, idx) => (
              <li
                key={`${airport.iata_code}-${idx}`}
                id={`${listboxId}-option-${idx}`}
                role="option"
                aria-selected={idx === highlightIdx}
                onClick={() => handleSelect(airport)}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  idx === highlightIdx
                    ? "bg-farenheit-50 text-farenheit-700"
                    : "hover:bg-[var(--muted)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  {airport.country_code ? (
                    <img
                      src={`https://flagcdn.com/w40/${airport.country_code.toLowerCase()}.png`}
                      srcSet={`https://flagcdn.com/w80/${airport.country_code.toLowerCase()}.png 2x`}
                      alt=""
                      aria-hidden="true"
                      className="w-7 h-5 object-cover rounded-sm shrink-0"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <span className="w-7 h-5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="truncate">
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

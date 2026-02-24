"use client";

import { useState, useEffect, useRef } from "react";

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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setQuery(value);
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

  const searchAirports = async (q: string) => {
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
      }
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    onSelect("", val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAirports(val), 200);
  };

  const handleSelect = (airport: Airport) => {
    const displayName = airport.city_ko
      ? `${airport.city_ko} (${airport.iata_code})`
      : `${airport.city} (${airport.iata_code})`;
    setQuery(displayName);
    onSelect(airport.iata_code, displayName);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium mb-1 text-left">{label}</label>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => { if (results.length > 0) setIsOpen(true); }}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
      />

      {isOpen && (
        <ul className="absolute z-50 w-full mt-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {isLoading ? (
            <li className="px-4 py-3 text-sm text-[var(--muted-foreground)]">검색 중...</li>
          ) : (
            results.map((airport) => (
              <li
                key={airport.iata_code}
                onClick={() => handleSelect(airport)}
                className="px-4 py-3 cursor-pointer hover:bg-[var(--muted)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">
                      {airport.city_ko || airport.city}
                    </span>
                    <span className="text-[var(--muted-foreground)] text-sm ml-2">
                      {airport.city_ko ? airport.city : ""}
                    </span>
                  </div>
                  <span className="text-sm font-mono text-[var(--muted-foreground)]">
                    {airport.iata_code}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{airport.name}</p>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

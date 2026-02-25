import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getSignalColor(signal: string): string {
  switch (signal) {
    case "BUY":
      return "text-green-600 bg-green-50";
    case "WAIT":
      return "text-yellow-600 bg-yellow-50";
    case "HOLD":
      return "text-gray-500 bg-gray-50";
    default:
      return "text-gray-500 bg-gray-50";
  }
}

export function getTemperatureColor(pricePosition: number): string {
  // 0 = coolest (best price), 1 = hottest (worst price)
  if (pricePosition < 0.25) return "bg-cool-500 text-white";
  if (pricePosition < 0.5) return "bg-cool-300";
  if (pricePosition < 0.75) return "bg-farenheit-300";
  return "bg-farenheit-500 text-white";
}

// Recent searches (localStorage)
export interface RecentSearch {
  origin: string;
  dest: string;
  originDisplay: string;
  destDisplay: string;
  date: string;
  returnDate?: string;
  cabinClass: string;
  minPrice?: number;
  timestamp: number;
}

const RECENT_SEARCHES_KEY = "farenheit_recent_searches";
const MAX_RECENT = 8;

export function getRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentSearch[];
  } catch {
    return [];
  }
}

export function saveRecentSearch(search: Omit<RecentSearch, "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentSearches();
    // Remove duplicate (same origin+dest+date)
    const filtered = existing.filter(
      s => !(s.origin === search.origin && s.dest === search.dest && s.date === search.date)
    );
    const updated = [{ ...search, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

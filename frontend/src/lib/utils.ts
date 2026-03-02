export const VALID_CABIN_CLASSES = ["ECONOMY", "BUSINESS", "FIRST"] as const;

export const CABIN_CLASS_LABELS: Record<string, string> = {
  ECONOMY: "이코노미",
  BUSINESS: "비즈니스",
  FIRST: "퍼스트",
};

export const SAME_ORIGIN_DEST_MSG = "출발지와 도착지가 같습니다.";

export function formatPrice(amount: number, currency = "KRW"): string {
  if (!Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: currency === "KRW" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatDate(date: string): string {
  if (!date) return "-";
  try {
    // Append T00:00:00 for date-only strings to avoid UTC midnight shift
    const d = date.includes("T") ? new Date(date) : new Date(date + "T00:00:00");
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

export function getLocalToday(): string {
  return new Date().toLocaleDateString("sv-SE");
}

export function getDefaultSearchDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString("sv-SE");
}

export function getDateOneYearLater(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toLocaleDateString("sv-SE");
}

export function formatRelativeTime(isoStr: string): string {
  if (!isoStr) return "-";
  const timestamp = new Date(isoStr).getTime();
  if (isNaN(timestamp)) return "-";
  const diff = Date.now() - timestamp;
  if (diff < 0) return "방금 전";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
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
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate each entry has required fields
    const validCabins: readonly string[] = VALID_CABIN_CLASSES;
    return parsed.filter(
      (s: unknown): s is RecentSearch => {
        if (typeof s !== "object" || s === null) return false;
        const r = s as RecentSearch;
        return (
          typeof r.origin === "string" && r.origin.length > 0 &&
          typeof r.dest === "string" && r.dest.length > 0 &&
          typeof r.date === "string" && r.date.length > 0 &&
          typeof r.originDisplay === "string" &&
          typeof r.destDisplay === "string" &&
          typeof r.cabinClass === "string" && validCabins.includes(r.cabinClass) &&
          typeof r.timestamp === "number" && Number.isFinite(r.timestamp)
        );
      }
    );
  } catch {
    return [];
  }
}

export function saveRecentSearch(search: Omit<RecentSearch, "timestamp">): void {
  if (typeof window === "undefined") return;
  try {
    const existing = getRecentSearches();
    // Remove duplicate (same origin+dest+date+cabin)
    const filtered = existing.filter(
      s => !(s.origin === search.origin && s.dest === search.dest && s.date === search.date && s.cabinClass === search.cabinClass)
    );
    const updated = [{ ...search, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

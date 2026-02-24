const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown
  ) {
    super(`API Error: ${status}`);
  }
}

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("access_token");
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => null));
  }

  return res.json();
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== ""
  );
  return new URLSearchParams(
    entries.map(([k, v]) => [k, String(v)])
  ).toString();
}

// Types
export interface FlightOffer {
  airline_code: string;
  airline_name: string | null;
  departure_date: string;
  return_date: string | null;
  cabin_class: string;
  price_amount: number;
  currency: string;
  stops: number;
  duration_minutes: number | null;
  source: string;
  departure_time: string | null;
  arrival_time: string | null;
}

export interface FlightSearchResponse {
  origin: string;
  destination: string;
  departure_date: string;
  cabin_class: string;
  offers: FlightOffer[];
  total_count: number;
}

export interface StatsResponse {
  routes: number;
  prices: number;
  predictions: number;
  airports: number;
}

export interface Airport {
  iata_code: string;
  name: string;
  city: string;
  city_ko: string | null;
  country_code: string;
}

// Flight APIs
export const flightsApi = {
  search: (params: {
    origin: string;
    dest: string;
    departure_date: string;
    cabin_class?: string;
  }) => fetchAPI<FlightSearchResponse>(`/flights/search?${qs(params)}`),

  priceHistory: (params: {
    route_id: number;
    departure_date: string;
    airline_code?: string;
    days?: number;
  }) => fetchAPI(`/flights/prices/history?${qs(params)}`),
};

// Prediction APIs
export const predictionsApi = {
  get: (params: {
    route_id: number;
    departure_date: string;
    cabin_class?: string;
  }) => fetchAPI(`/predictions?${qs(params)}`),

  heatmap: (params: { origin: string; dest: string; month: string }) =>
    fetchAPI(`/predictions/heatmap?${qs(params)}`),
};

// Recommendation APIs
export const recommendationsApi = {
  get: (params: {
    origin: string;
    dest: string;
    departure_date: string;
    cabin_class?: string;
  }) => fetchAPI(`/recommendations?${qs(params)}`),
};

// Route APIs
export const routesApi = {
  popular: (limit?: number) =>
    fetchAPI(`/routes/popular?${qs({ limit: limit ?? 10 })}`),

  searchAirports: (q: string) =>
    fetchAPI<Airport[]>(`/routes/airports/search?${qs({ q })}`),
};

// Stats API
export const statsApi = {
  get: () => fetchAPI<StatsResponse>("/stats"),
};

// Auth APIs
export const authApi = {
  login: (email: string, password: string) =>
    fetchAPI<{ access_token: string; token_type: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, display_name?: string) =>
    fetchAPI<{ id: number; email: string; display_name: string | null }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, display_name }),
    }),
};

// Health API
export const healthApi = {
  check: () => fetchAPI("/health"),
};

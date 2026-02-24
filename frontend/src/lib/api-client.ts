const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown
  ) {
    super(`API Error: ${status}`);
  }
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
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
  // Return leg (round-trip)
  return_departure_time: string | null;
  return_arrival_time: string | null;
  return_stops: number | null;
  return_duration_minutes: number | null;
}

export interface AirlineInfo {
  code: string;
  name: string;
}

export interface FlightSearchResponse {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string | null;
  trip_type: string;
  cabin_class: string;
  offers: FlightOffer[];
  total_count: number;
  available_airlines: AirlineInfo[];
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
export interface AlertResponse {
  id: number;
  route_id: number;
  target_price: number;
  cabin_class: string;
  departure_date: string | null;
  is_triggered: boolean;
  triggered_at: string | null;
  created_at: string;
}

export const flightsApi = {
  search: (params: {
    origin: string;
    dest: string;
    departure_date: string;
    return_date?: string;
    cabin_class?: string;
    max_stops?: number | string;
    sort_by?: string;
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
    origin: string;
    dest: string;
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

// Alerts API
export const alertsApi = {
  list: () => fetchAPI<AlertResponse[]>("/alerts"),

  create: (data: {
    route_id: number;
    target_price: number;
    cabin_class?: string;
    departure_date?: string;
  }) =>
    fetchAPI<AlertResponse>("/alerts", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchAPI(`/alerts/${id}`, { method: "DELETE" }),
};


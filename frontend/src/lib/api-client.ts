export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown
  ) {
    super(`API Error: ${status}`);
  }
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 35000);

  // If caller provides a signal, link it with our timeout controller
  if (options?.signal) {
    const externalSignal = options.signal;
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(externalSignal.reason), { once: true });
    }
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new ApiError(res.status, await res.json().catch(() => null));
    }

    // Handle 204 No Content (e.g., DELETE responses)
    if (res.status === 204) {
      return undefined as T;
    }

    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
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
  flight_number: string | null;
  // Return leg (round-trip)
  return_flight_number: string | null;
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
  route_id: number | null;
  data_source: string;
}

export interface PriceHistoryResponse {
  route_id: number;
  departure_date: string;
  airline_code: string | null;
  prices: { time: string; price_amount: number; airline_code: string; source: string }[];
  min_price: number | null;
  max_price: number | null;
  avg_price: number | null;
}

export interface StatsResponse {
  routes: number;
  prices: number;
  predictions: number;
  airports: number;
  last_price_collected_at: string | null;
  last_predicted_at: string | null;
  error?: boolean;
}

export interface Airport {
  iata_code: string;
  name: string;
  city: string;
  city_ko: string | null;
  country_code: string;
}

export interface ForecastPoint {
  date: string;
  predicted_price: number;
  confidence_low: number;
  confidence_high: number;
}

export interface PredictionResponse {
  route_id: number;
  departure_date: string;
  cabin_class: string;
  predicted_price: number | null;
  confidence_low: number | null;
  confidence_high: number | null;
  price_direction: string;
  confidence_score: number | null;
  model_version: string;
  predicted_at: string | null;
  forecast_series: ForecastPoint[];
}

export interface HeatmapCell {
  departure_date: string;
  weeks_before: number;
  predicted_price: number;
  price_level: string;
}

export interface HeatmapResponse {
  origin: string;
  destination: string;
  month: string;
  cells: HeatmapCell[];
}

export interface RecommendationResponse {
  origin: string;
  destination: string;
  departure_date: string;
  cabin_class: string;
  signal: string;
  best_airline: string | null;
  current_price: number | null;
  predicted_low: number | null;
  predicted_low_date: string | null;
  confidence: number | null;
  reasoning: string;
}

export interface RouteResponse {
  id: number;
  origin_code: string;
  dest_code: string;
  origin_city: string | null;
  dest_city: string | null;
  is_active: boolean;
}

export interface AlertResponse {
  id: number;
  route_id: number;
  origin: string | null;
  destination: string | null;
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
  }) => fetchAPI<PriceHistoryResponse>(`/flights/prices/history?${qs(params)}`),
};

// Prediction APIs
export const predictionsApi = {
  get: (params: {
    origin: string;
    dest: string;
    departure_date: string;
    cabin_class?: string;
  }) => fetchAPI<PredictionResponse>(`/predictions?${qs(params)}`),

  heatmap: (params: { origin: string; dest: string; month: string; cabin_class?: string }) =>
    fetchAPI<HeatmapResponse>(`/predictions/heatmap?${qs(params)}`),
};

// Recommendation APIs
export const recommendationsApi = {
  get: (params: {
    origin: string;
    dest: string;
    departure_date: string;
    cabin_class?: string;
  }) => fetchAPI<RecommendationResponse>(`/recommendations?${qs(params)}`),
};

// Route APIs
export const routesApi = {
  popular: (limit?: number) =>
    fetchAPI<RouteResponse[]>(`/routes/popular?${qs({ limit: limit ?? 10 })}`),

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
    origin: string;
    destination: string;
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

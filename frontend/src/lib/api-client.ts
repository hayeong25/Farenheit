export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api/v1";

const FETCH_TIMEOUT_MS = 35_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown
  ) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : "";
    super(detail ? `API Error ${status}: ${detail}` : `API Error: ${status}`);
  }
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
  search: async (params: {
    origin: string;
    dest: string;
    departure_date: string;
    return_date?: string;
    cabin_class?: string;
    max_stops?: number | string;
    sort_by?: string;
  }): Promise<FlightSearchResponse> => {
    const res = await fetchAPI<FlightSearchResponse>(`/flights/search?${qs(params)}`);
    // Decimal fields arrive as strings from Pydantic; coerce to number
    for (const o of res.offers) {
      o.price_amount = Number(o.price_amount);
    }
    return res;
  },

  priceHistory: async (params: {
    route_id: number;
    departure_date: string;
    airline_code?: string;
    days?: number;
  }): Promise<PriceHistoryResponse> => {
    const res = await fetchAPI<PriceHistoryResponse>(`/flights/prices/history?${qs(params)}`);
    for (const p of res.prices) {
      p.price_amount = Number(p.price_amount);
    }
    if (res.min_price != null) res.min_price = Number(res.min_price);
    if (res.max_price != null) res.max_price = Number(res.max_price);
    if (res.avg_price != null) res.avg_price = Number(res.avg_price);
    return res;
  },
};

// Prediction APIs
export const predictionsApi = {
  get: async (params: {
    origin: string;
    dest: string;
    departure_date: string;
    cabin_class?: string;
  }): Promise<PredictionResponse> => {
    const res = await fetchAPI<PredictionResponse>(`/predictions?${qs(params)}`);
    if (res.predicted_price != null) res.predicted_price = Number(res.predicted_price);
    if (res.confidence_low != null) res.confidence_low = Number(res.confidence_low);
    if (res.confidence_high != null) res.confidence_high = Number(res.confidence_high);
    if (res.confidence_score != null) res.confidence_score = Number(res.confidence_score);
    for (const f of res.forecast_series) {
      f.predicted_price = Number(f.predicted_price);
      f.confidence_low = Number(f.confidence_low);
      f.confidence_high = Number(f.confidence_high);
    }
    return res;
  },

  heatmap: async (params: { origin: string; dest: string; month: string; cabin_class?: string }): Promise<HeatmapResponse> => {
    const res = await fetchAPI<HeatmapResponse>(`/predictions/heatmap?${qs(params)}`);
    for (const c of res.cells) {
      c.predicted_price = Number(c.predicted_price);
    }
    return res;
  },
};

// Recommendation APIs
export const recommendationsApi = {
  get: async (params: {
    origin: string;
    dest: string;
    departure_date: string;
    cabin_class?: string;
  }): Promise<RecommendationResponse> => {
    const res = await fetchAPI<RecommendationResponse>(`/recommendations?${qs(params)}`);
    if (res.current_price != null) res.current_price = Number(res.current_price);
    if (res.predicted_low != null) res.predicted_low = Number(res.predicted_low);
    if (res.confidence != null) res.confidence = Number(res.confidence);
    return res;
  },
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

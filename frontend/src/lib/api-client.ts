const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
    throw new ApiError(res.status, await res.json());
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

// Flight APIs
export const flightsApi = {
  search: (params: {
    origin: string;
    dest: string;
    departure_date: string;
    cabin_class?: string;
  }) => fetchAPI(`/flights/search?${qs(params)}`),

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
    fetchAPI(`/routes/airports/search?${qs({ q })}`),
};

// Health API
export const healthApi = {
  check: () => fetchAPI("/health"),
};

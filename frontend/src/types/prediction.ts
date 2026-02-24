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
  predicted_price: number;
  confidence_low?: number;
  confidence_high?: number;
  price_direction: "UP" | "DOWN" | "STABLE";
  confidence_score?: number;
  model_version: string;
  predicted_at: string;
  forecast_series: ForecastPoint[];
}

export interface HeatmapCell {
  departure_date: string;
  weeks_before: number;
  predicted_price: number;
  price_level: "LOW" | "MEDIUM" | "HIGH";
}

export interface HeatmapResponse {
  origin: string;
  destination: string;
  month: string;
  cells: HeatmapCell[];
}

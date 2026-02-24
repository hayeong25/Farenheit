export interface RecommendationResponse {
  origin: string;
  destination: string;
  departure_date: string;
  cabin_class: string;
  signal: "BUY" | "WAIT" | "HOLD";
  best_airline?: string;
  current_price?: number;
  predicted_low?: number;
  predicted_low_date?: string;
  confidence?: number;
  reasoning: string;
}

export interface FlightOffer {
  airline_code: string;
  airline_name?: string;
  departure_date: string;
  return_date?: string;
  cabin_class: string;
  price_amount: number;
  currency: string;
  stops: number;
  duration_minutes?: number;
  source: string;
}

export interface FlightSearchResponse {
  origin: string;
  destination: string;
  departure_date: string;
  cabin_class: string;
  offers: FlightOffer[];
  total_count: number;
}

export interface PricePoint {
  time: string;
  price: number;
  airline_code: string;
  source: string;
}

export interface PriceHistoryResponse {
  route_id: number;
  departure_date: string;
  airline_code?: string;
  prices: PricePoint[];
  min_price?: number;
  max_price?: number;
  avg_price?: number;
}

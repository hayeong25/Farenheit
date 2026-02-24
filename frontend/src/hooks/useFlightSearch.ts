"use client";

import { useState } from "react";
import { flightsApi } from "@/lib/api-client";
import type { FlightSearchResponse } from "@/types/flight";

export function useFlightSearch() {
  const [data, setData] = useState<FlightSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (
    origin: string,
    dest: string,
    departureDate: string,
    cabinClass = "ECONOMY"
  ) => {
    setLoading(true);
    setError(null);
    try {
      const result = (await flightsApi.search({
        origin,
        dest,
        departure_date: departureDate,
        cabin_class: cabinClass,
      })) as FlightSearchResponse;
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, search };
}

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PricePoint } from "@/types/flight";

interface PriceLineChartProps {
  data: PricePoint[];
  airlines?: string[];
}

const AIRLINE_COLORS = [
  "#f83b3b",
  "#0695ff",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

export function PriceLineChart({ data, airlines = [] }: PriceLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[var(--muted-foreground)]">
        가격 데이터가 없습니다.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip
          formatter={(value: number) => [`$${value.toFixed(2)}`, "Price"]}
          labelFormatter={(label) => `Time: ${label}`}
        />
        <Legend />
        {airlines.length > 0 ? (
          airlines.map((airline, idx) => (
            <Line
              key={airline}
              type="monotone"
              dataKey={airline}
              stroke={AIRLINE_COLORS[idx % AIRLINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))
        ) : (
          <Line
            type="monotone"
            dataKey="price"
            stroke="#f83b3b"
            strokeWidth={2}
            dot={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

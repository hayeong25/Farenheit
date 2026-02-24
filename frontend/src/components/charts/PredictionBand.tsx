"use client";

import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ForecastPoint } from "@/types/prediction";

interface PredictionBandProps {
  data: ForecastPoint[];
}

export function PredictionBand({ data }: PredictionBandProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-[var(--muted-foreground)]">
        예측 데이터가 없습니다.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          tickFormatter={(value) => `$${value}`}
        />
        <Tooltip
          formatter={(value: number) => `$${value.toFixed(2)}`}
        />
        <Area
          type="monotone"
          dataKey="confidence_high"
          stackId="band"
          stroke="none"
          fill="#fee2e2"
          fillOpacity={0.5}
        />
        <Area
          type="monotone"
          dataKey="confidence_low"
          stackId="band"
          stroke="none"
          fill="#ffffff"
          fillOpacity={1}
        />
        <Line
          type="monotone"
          dataKey="predicted_price"
          stroke="#f83b3b"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

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
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(value) => `₩${Math.round(value).toLocaleString()}`}
          width={75}
        />
        <Tooltip
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = { predicted_price: "예측가", confidence_high: "예측 상한", confidence_low: "예측 하한" };
            return [`₩${Math.round(value).toLocaleString()}`, labels[name] || name];
          }}
          contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid var(--border)" }}
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

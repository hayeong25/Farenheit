"use client";

import {
  ComposedChart,
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

  // Transform data: compute band as [confidence_low, confidence_high] range
  const chartData = data.map((d) => ({
    ...d,
    band: [d.confidence_low, d.confidence_high],
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(value) => `₩${Math.round(value).toLocaleString()}`}
          width={75}
          domain={["auto", "auto"]}
        />
        <Tooltip
          formatter={(value: number | number[], name: string) => {
            if (name === "band" && Array.isArray(value)) {
              return [`₩${Math.round(value[0]).toLocaleString()} ~ ₩${Math.round(value[1]).toLocaleString()}`, "예측 범위"];
            }
            const labels: Record<string, string> = { predicted_price: "예측가" };
            const v = typeof value === "number" ? value : value[0];
            return [`₩${Math.round(v).toLocaleString()}`, labels[name] || name];
          }}
          contentStyle={{ fontSize: 13, borderRadius: 8, border: "1px solid var(--border)" }}
        />
        <Area
          type="monotone"
          dataKey="band"
          stroke="none"
          fill="#fee2e2"
          fillOpacity={0.5}
        />
        <Line
          type="monotone"
          dataKey="predicted_price"
          stroke="#f83b3b"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

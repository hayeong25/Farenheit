export default function PredictionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Price Predictions</h1>

      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">Price Heatmap</h2>
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p>출발일 x 예약 시점 기준 가격 히트맵이 표시됩니다.</p>
          <p className="text-sm mt-1">충분한 가격 데이터가 수집되면 활성화됩니다.</p>
        </div>
      </div>

      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">Forecast Chart</h2>
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p>AI 가격 예측 차트가 여기에 표시됩니다.</p>
        </div>
      </div>
    </div>
  );
}

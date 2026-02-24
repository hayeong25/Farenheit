export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">추적 중인 노선</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">수집된 가격 데이터</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">활성 예측</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted-foreground)]">가격 알림</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">Top Recommendations</h2>
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p>아직 추천 데이터가 없습니다.</p>
          <p className="text-sm mt-1">노선을 추가하고 가격 데이터를 수집해보세요.</p>
        </div>
      </div>

      {/* Price Trends */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">Price Trends</h2>
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p>가격 트렌드 차트가 여기에 표시됩니다.</p>
        </div>
      </div>
    </div>
  );
}

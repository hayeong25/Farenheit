export default function RecommendationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Recommendations</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Signal Legend */}
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <div>
              <p className="font-semibold text-green-600">BUY</p>
              <p className="text-sm text-[var(--muted-foreground)]">지금 구매 추천</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <div>
              <p className="font-semibold text-yellow-600">WAIT</p>
              <p className="text-sm text-[var(--muted-foreground)]">가격 하락 예상, 대기</p>
            </div>
          </div>
        </div>
        <div className="bg-[var(--background)] rounded-xl p-5 border border-[var(--border)]">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-gray-400" />
            <div>
              <p className="font-semibold text-gray-500">HOLD</p>
              <p className="text-sm text-[var(--muted-foreground)]">추가 분석 필요</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">Active Recommendations</h2>
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p>관심 노선의 구매 추천이 여기에 표시됩니다.</p>
        </div>
      </div>
    </div>
  );
}

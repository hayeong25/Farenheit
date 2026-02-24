"use client";

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Price Alerts</h1>
        <button className="px-4 py-2 rounded-lg bg-farenheit-500 text-white hover:bg-farenheit-600 transition-colors">
          + 알림 추가
        </button>
      </div>

      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <p>설정된 가격 알림이 없습니다.</p>
          <p className="text-sm mt-1">목표 가격을 설정하면 도달 시 알림을 보내드립니다.</p>
        </div>
      </div>
    </div>
  );
}

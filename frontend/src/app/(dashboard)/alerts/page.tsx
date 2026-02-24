"use client";

import { useState } from "react";

export default function AlertsPage() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">가격 알림</h1>
        <button
          onClick={() => setShowInfo(true)}
          className="px-4 py-2 rounded-lg bg-farenheit-500 text-white hover:bg-farenheit-600 transition-colors"
        >
          + 알림 추가
        </button>
      </div>

      {/* How it works */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-3">알림 설정 방법</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <div className="text-2xl mb-2">1️⃣</div>
            <p className="font-medium text-sm">노선과 목표 가격 설정</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              관심 있는 노선의 목표 가격을 설정하세요
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <div className="text-2xl mb-2">2️⃣</div>
            <p className="font-medium text-sm">AI가 가격 모니터링</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              30분 간격으로 가격을 수집하고 분석합니다
            </p>
          </div>
          <div className="p-4 rounded-lg bg-[var(--muted)]">
            <div className="text-2xl mb-2">3️⃣</div>
            <p className="font-medium text-sm">목표가 도달 시 알림</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              목표 가격에 도달하면 즉시 알려드립니다
            </p>
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="bg-[var(--background)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold mb-4">내 알림 목록</h2>
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <div className="text-4xl mb-3">🔔</div>
          <p>설정된 가격 알림이 없습니다.</p>
          <p className="text-sm mt-1">로그인 후 알림을 추가할 수 있습니다.</p>
        </div>
      </div>

      {/* Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowInfo(false)}>
          <div
            className="bg-[var(--background)] rounded-xl p-6 w-full max-w-md border border-[var(--border)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4">알림 추가</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              가격 알림을 설정하려면 먼저 로그인이 필요합니다.
              상단의 Login 버튼을 클릭하여 로그인하세요.
            </p>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              로그인 후 관심 노선의 목표 가격을 설정하면, 해당 가격에 도달했을 때 알림을 받을 수 있습니다.
            </p>
            <button
              onClick={() => setShowInfo(false)}
              className="w-full py-2.5 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

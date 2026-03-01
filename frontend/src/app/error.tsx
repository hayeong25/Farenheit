"use client";

import Link from "next/link";
import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div role="alert" className="flex flex-col items-center justify-center min-h-screen gap-6 px-4 bg-[var(--background)]">
      <div className="flex flex-col items-center gap-5 max-w-md text-center">
        {/* Icon */}
        <div className="w-20 h-20 rounded-full bg-farenheit-50 flex items-center justify-center ring-4 ring-farenheit-100">
          <svg
            className="w-10 h-10 text-farenheit-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">
            문제가 발생했습니다
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            예상치 못한 오류가 발생했습니다.
            <br />
            아래 버튼을 눌러 다시 시도하거나, 홈으로 돌아가 주세요.
          </p>
        </div>

        {/* Error digest (dev only) */}
        {error.digest && (
          <p className="text-xs text-[var(--muted-foreground)] font-mono bg-[var(--muted)] px-3 py-1.5 rounded-md">
            오류 코드: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <button
            onClick={() => reset()}
            className="px-6 py-2.5 rounded-lg bg-farenheit-500 text-white font-medium hover:bg-farenheit-600 active:bg-farenheit-700 transition-colors focus:outline-none focus:ring-2 focus:ring-farenheit-500 focus:ring-offset-2"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-lg border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--muted)] transition-colors text-center focus:outline-none focus:ring-2 focus:ring-farenheit-500 focus:ring-offset-2"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}

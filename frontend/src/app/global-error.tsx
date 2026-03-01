"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-screen gap-6 p-4 font-sans"
        >
          <h2 className="text-2xl font-bold">
            심각한 오류가 발생했습니다
          </h2>
          <p className="text-gray-500 text-center">
            페이지를 불러오는 중 문제가 발생했습니다.
            {error.digest && (
              <span className="block text-xs font-mono mt-2">
                오류 코드: {error.digest}
              </span>
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => reset()}
              className="px-6 py-2.5 rounded-lg bg-orange-500 text-white font-medium border-none cursor-pointer hover:bg-orange-600 transition-colors"
            >
              다시 시도
            </button>
            <a
              href="/"
              className="px-6 py-2.5 rounded-lg border border-gray-200 no-underline text-inherit font-medium hover:bg-gray-50 transition-colors"
            >
              홈으로 돌아가기
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

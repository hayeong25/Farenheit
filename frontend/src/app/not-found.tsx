import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4 bg-[var(--background)]">
      <div className="flex flex-col items-center gap-5 max-w-md text-center">
        <div className="w-20 h-20 rounded-full bg-farenheit-50 dark:bg-farenheit-950 flex items-center justify-center ring-4 ring-farenheit-100 dark:ring-farenheit-900">
          <span className="text-3xl font-bold text-farenheit-500">404</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-[var(--foreground)]">
            페이지를 찾을 수 없습니다
          </h2>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            요청하신 페이지가 존재하지 않거나 이동되었습니다.
            <br />
            주소를 다시 확인하거나, 아래 링크로 이동해 주세요.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-lg bg-farenheit-500 text-white font-medium hover:bg-farenheit-600 transition-colors text-center focus:outline-none focus:ring-2 focus:ring-farenheit-500 focus:ring-offset-2"
          >
            홈으로 돌아가기
          </Link>
          <Link
            href="/search"
            className="px-6 py-2.5 rounded-lg border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--muted)] transition-colors text-center focus:outline-none focus:ring-2 focus:ring-farenheit-500 focus:ring-offset-2"
          >
            항공편 검색
          </Link>
        </div>
      </div>
    </div>
  );
}

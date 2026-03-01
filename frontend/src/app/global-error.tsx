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
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: "1.5rem",
            padding: "1rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            심각한 오류가 발생했습니다
          </h2>
          <p style={{ color: "#6b6b6b", textAlign: "center" }}>
            페이지를 불러오는 중 문제가 발생했습니다.
            {error.digest && (
              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  marginTop: "0.5rem",
                }}
              >
                오류 코드: {error.digest}
              </span>
            )}
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={() => reset()}
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "0.5rem",
                backgroundColor: "#f97316",
                color: "white",
                border: "none",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
            <a
              href="/"
              style={{
                padding: "0.625rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid #e5e5e5",
                textDecoration: "none",
                color: "inherit",
                fontWeight: 500,
              }}
            >
              홈으로 돌아가기
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}

"use client";

import { useEffect, useState } from "react";
import { healthApi, authApi } from "@/lib/api-client";

export function Topbar() {
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "error">("checking");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("user_name") : null;
    if (stored) setUser(stored);

    healthApi.check()
      .then(() => setApiStatus("ok"))
      .catch(() => setApiStatus("error"));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_name");
    setUser(null);
  };

  return (
    <>
      <header className="h-16 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--muted-foreground)]">API:</span>
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${
              apiStatus === "ok" ? "bg-green-500" :
              apiStatus === "error" ? "bg-red-500" :
              "bg-yellow-500 animate-pulse"
            }`} />
            <span className="text-sm">
              {apiStatus === "ok" ? "Connected" : apiStatus === "error" ? "Disconnected" : "Checking..."}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-sm">{user}</span>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => { setShowAuthModal(true); setIsLogin(true); }}
              className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:bg-[var(--muted)] transition-colors"
            >
              Login
            </button>
          )}
        </div>
      </header>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          isLogin={isLogin}
          onSwitch={() => setIsLogin(!isLogin)}
          onClose={() => setShowAuthModal(false)}
          onSuccess={(name) => {
            setUser(name);
            setShowAuthModal(false);
          }}
        />
      )}
    </>
  );
}

function AuthModal({
  isLogin,
  onSwitch,
  onClose,
  onSuccess,
}: {
  isLogin: boolean;
  onSwitch: () => void;
  onClose: () => void;
  onSuccess: (name: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        const res = await authApi.login(email, password);
        localStorage.setItem("access_token", res.access_token);
        localStorage.setItem("user_name", email.split("@")[0]);
        onSuccess(email.split("@")[0]);
      } else {
        await authApi.register(email, password, displayName || undefined);
        // Auto-login after register
        const res = await authApi.login(email, password);
        localStorage.setItem("access_token", res.access_token);
        localStorage.setItem("user_name", displayName || email.split("@")[0]);
        onSuccess(displayName || email.split("@")[0]);
      }
    } catch (err: unknown) {
      const apiErr = err as { data?: { detail?: string } };
      setError(apiErr?.data?.detail || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--background)] rounded-xl p-6 w-full max-w-sm border border-[var(--border)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">{isLogin ? "로그인" : "회원가입"}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium mb-1">이름</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
                placeholder="홍길동"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-farenheit-500"
              placeholder="6자 이상"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-farenheit-500 text-white font-semibold hover:bg-farenheit-600 transition-colors disabled:opacity-50"
          >
            {loading ? "처리 중..." : isLogin ? "로그인" : "회원가입"}
          </button>
        </form>

        <p className="text-sm text-center mt-4 text-[var(--muted-foreground)]">
          {isLogin ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}{" "}
          <button onClick={onSwitch} className="text-farenheit-500 hover:underline">
            {isLogin ? "회원가입" : "로그인"}
          </button>
        </p>
      </div>
    </div>
  );
}

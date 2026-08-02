"use client";

import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Cloudflare Access からの自動ログインに失敗するとここへ戻される。
  // 理由が出ないと利用者は同じ操作を繰り返すことになる
  const [error, setError] = useState<string | null>(
    searchParams.get("error")
  );
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("メールアドレスまたはパスワードが正しくありません");
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Supabase に接続できません。環境変数を確認してください。");
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--color-bg-default)" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: "var(--color-terra)" }}
          >
            ITERRA CRM
          </h1>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-sumi700)" }}
          >
            営業・取引管理システム
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold tracking-wide mb-1.5"
              style={{ color: "var(--color-text-body)" }}
            >
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="email@example.com"
              className="w-full px-4 py-2.5 text-sm outline-none transition-shadow"
              style={{
                backgroundColor: "#fff",
                borderBottom: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-input)",
                color: "var(--color-text-body)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderBottomColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderBottomColor = "var(--color-border-default)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold tracking-wide mb-1.5"
              style={{ color: "var(--color-text-body)" }}
            >
              パスワード
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 text-sm outline-none transition-shadow"
              style={{
                backgroundColor: "#fff",
                borderBottom: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-input)",
                color: "var(--color-text-body)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderBottomColor = "var(--color-border-focus)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderBottomColor = "var(--color-border-default)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--color-error)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--color-terra)",
              borderRadius: "var(--radius-button)",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = "var(--color-terra-dark)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-terra)";
            }}
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}

/** useSearchParams を使うため Suspense で包む（Next.js の要件） */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

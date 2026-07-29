import { NextResponse } from "next/server";

/**
 * ヘルスチェック。
 *
 * - 既定（`/api/health`）: プロセスの生存のみを返す。Docker の healthcheck 用。
 *   DB 障害でコンテナを再起動しても復旧しないため、疎通結果は含めない。
 * - `?deep=1`: Supabase への疎通も確認する。外形監視・障害切り分け用。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  if (!deep) {
    return NextResponse.json({ status: "ok" });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.json(
      { status: "error", database: "unconfigured" },
      { status: 503 }
    );
  }

  try {
    // 認証を伴わない軽量なエンドポイントで到達性だけを確認する
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { status: "error", database: "unreachable", code: res.status },
        { status: 503 }
      );
    }

    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json(
      { status: "error", database: "unreachable" },
      { status: 503 }
    );
  }
}

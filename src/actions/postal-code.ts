"use server";

/**
 * 郵便番号から住所を引く。
 *
 * 外部 API（zipcloud）を**サーバー側から**叩く。クライアントから直接呼ぶと
 * 通信先が増えて CSP と CORS の面倒を持ち込むうえ、外部の障害が画面の
 * JavaScript エラーとして出てしまう。
 *
 * **これは入力の補助でしかない。** API が落ちていても住所は手で入力できる状態を
 * 保つこと（呼び出し側は失敗しても欄を触れるままにする）。
 * 認証キーは要らないサービスなので環境変数は増やしていない。
 */

import { createClient } from "@/lib/supabase/server";

const ENDPOINT = "https://zipcloud.ibsnet.co.jp/api/search";
const TIMEOUT_MS = 5_000;

export type PostalCodeResult = {
  prefecture: string;
  city: string;
  /** 町域。番地までは含まない */
  town: string;
};

type ZipCloudResponse = {
  status: number;
  message: string | null;
  results:
    | { address1: string; address2: string; address3: string }[]
    | null;
};

export async function lookupPostalCode(
  input: string
): Promise<{ data: PostalCodeResult | null; error: string | null }> {
  // 住所の入力補助とはいえ外部へ出ていくので、認証済みからのみ受ける
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  // ハイフン・全角を落として 7 桁だけにする
  const digits = (input ?? "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, "");

  if (digits.length !== 7) {
    return {
      data: null,
      error: `郵便番号は 7 桁で入力してください。受信値: ${input}`,
    };
  }

  try {
    const res = await fetch(`${ENDPOINT}?zipcode=${digits}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        data: null,
        error: `住所の検索に失敗しました（HTTP ${res.status}）。お手数ですが住所を直接入力してください`,
      };
    }

    const json = (await res.json()) as ZipCloudResponse;

    if (!json.results || json.results.length === 0) {
      return {
        data: null,
        error: `郵便番号 ${digits} に該当する住所が見つかりませんでした。直接入力してください`,
      };
    }

    const top = json.results[0];
    return {
      data: {
        prefecture: top.address1 ?? "",
        city: top.address2 ?? "",
        town: top.address3 ?? "",
      },
      error: null,
    };
  } catch {
    // タイムアウト・通信断。**入力そのものは続けられるので、案内に留める**
    return {
      data: null,
      error:
        "住所の検索サービスに繋がりませんでした。お手数ですが住所を直接入力してください",
    };
  }
}

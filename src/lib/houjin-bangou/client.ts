/**
 * 国税庁 法人番号 Web-API（Ver.4）クライアント。
 *
 * 利用には無償のアプリケーションID が要る（国税庁サイトで発行）。
 * 未設定でもビルド・起動は通し、実行時に「未設定」を返す。
 * 設定していない環境で画面が壊れないようにするため。
 *
 * 利用規約上の注意:
 *   - 大量アクセスを避ける（本実装は 1 件ずつ、呼び出し間隔を空ける）
 *   - 取得データは法人番号公表サイトの公表情報
 */

import { parseHoujinCsv, type HoujinRecord } from "./parse";

const BASE_URL = "https://api.houjin-bangou.nta.go.jp/4";

/** 連続アクセスを避けるための最小間隔（ミリ秒） */
export const REQUEST_INTERVAL_MS = 1000;

export type HoujinApiResult =
  | { ok: true; records: HoujinRecord[] }
  | { ok: false; reason: "not_configured" | "http_error" | "network_error"; message: string };

export function isHoujinApiConfigured(): boolean {
  return Boolean(process.env.HOUJIN_BANGOU_APP_ID);
}

async function request(path: string, params: Record<string, string>): Promise<HoujinApiResult> {
  const appId = process.env.HOUJIN_BANGOU_APP_ID;
  if (!appId) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "法人番号 Web-API のアプリケーションID が未設定です（環境変数 HOUJIN_BANGOU_APP_ID）",
    };
  }

  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set("id", appId);
  // type=02: CSV / Unicode。XML より依存が少なく、既存の CSV パーサを使える
  url.searchParams.set("type", "02");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  try {
    const res = await fetch(url, {
      // 公表情報の照会なので認証情報は送らない
      headers: { Accept: "text/csv" },
      // 応答が無い相手で処理全体を止めない
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: "http_error",
        message: `法人番号 API が ${res.status} を返しました`,
      };
    }

    return { ok: true, records: parseHoujinCsv(await res.text()) };
  } catch (e) {
    return {
      ok: false,
      reason: "network_error",
      message: e instanceof Error ? e.message : "法人番号 API への接続に失敗しました",
    };
  }
}

/**
 * 商号で検索する。法人番号を持っていない法人の照合に使う。
 *
 * mode=1（前方一致）を使う。部分一致だと「テスト」で
 * 「テストサービス」「日本テスト」等が大量に返り、絞り込みの意味が薄れる。
 * 一致判定は match.ts が正規化名の完全一致で行う。
 */
export function searchByName(name: string): Promise<HoujinApiResult> {
  return request("name", { name, mode: "1", target: "1" });
}

/** 法人番号で検索する。番号を引き当て済みの法人の定期確認に使う */
export function searchByNumber(corporateNumber: string): Promise<HoujinApiResult> {
  return request("num", { number: corporateNumber });
}

/**
 * Cloudflare D1 の読み取り。
 *
 * コーポレートサイト（corporate-iterra）の問い合わせフォームは、送信内容を
 * D1 の `leads` テーブルへ書いている。CRM はそれを定期的に取りに行って
 * リードとして取り込む。**サイト側には手を入れない。**
 *
 * サイトから CRM へ push する形にしないのは、CRM が落ちている間の
 * 取りこぼしを気にせず済むため。D1 に残っていれば次の実行で拾える。
 *
 * 未設定なら null を返す（連携を使わない環境で起動を止めない）。
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

export type D1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

export function getD1Config(): D1Config | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !databaseId || !apiToken) return null;

  return { accountId, databaseId, apiToken };
}

type D1Response<T> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: { results?: T[]; success?: boolean }[];
};

/**
 * D1 に問い合わせて行を返す。
 * 読み取り専用の用途しか想定していないので、失敗は例外で上へ返す。
 */
export async function queryD1<T>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const config = getD1Config();
  if (!config) throw new Error("D1 連携が未設定です");

  const res = await fetch(
    `${API_BASE}/accounts/${config.accountId}/d1/database/${config.databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
      // 取込は定期実行なので、詰まったら次の回に任せる
      signal: AbortSignal.timeout(30_000),
    }
  );

  if (!res.ok) {
    throw new Error(`D1 への問い合わせに失敗しました（HTTP ${res.status}）`);
  }

  const json = (await res.json()) as D1Response<T>;
  if (!json.success) {
    const reason = json.errors?.map((e) => e.message).join(" / ") ?? "原因不明";
    throw new Error(`D1 への問い合わせに失敗しました: ${reason}`);
  }

  return json.result?.[0]?.results ?? [];
}

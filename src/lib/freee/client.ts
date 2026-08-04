/**
 * freee API / OAuth の薄いクライアント。
 *
 * SDK は入れない。使うのは数エンドポイントだけで、依存を増やすほどの量ではない
 * （Gmail 連携が googleapis を入れなかったのと同じ判断）。
 *
 * 注意: freee のリフレッシュトークンは**ローテーション式**。
 * refreshTokens() は必ず新しいリフレッシュトークンを返し、古い値は失効する。
 * 呼び出し側は**返ってきた値を先に保存してから**次の処理へ進むこと
 * （保存より先に落ちると接続が死に、再認可が必要になる）。
 */

import type { FreeePartner } from "./partner";

const OAUTH_AUTH_URL = "https://accounts.secure.freee.co.jp/public_api/authorize";
const OAUTH_TOKEN_URL = "https://accounts.secure.freee.co.jp/public_api/token";
const API_BASE = "https://api.freee.co.jp";

/** 1 リクエストの上限（API 仕様の最大値）。取引先は数百件規模なので通常 1 回で収まる */
const PARTNERS_PAGE_LIMIT = 3000;

const FETCH_TIMEOUT_MS = 30_000;

export type FreeeTokenResponse = {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresInSec: number;
};

export type FreeeCompany = {
  id: number;
  name: string | null;
  display_name?: string | null;
};

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    state: params.state,
  });
  return `${OAUTH_AUTH_URL}?${q.toString()}`;
}

async function requestToken(body: URLSearchParams): Promise<FreeeTokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(describeOAuthError(json, res.status));
  }
  if (!json.refresh_token) {
    // freee は毎回リフレッシュトークンを返す仕様。返らないのは異常
    throw new Error("freee からリフレッシュトークンが返りませんでした");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    scope: json.scope ?? "",
    expiresInSec: json.expires_in ?? 21_600,
  };
}

export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<FreeeTokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
    })
  );
}

/** ローテーション式。戻り値の refreshToken を**必ず保存してから**先へ進む */
export async function refreshTokens(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<FreeeTokenResponse> {
  return requestToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    })
  );
}

/**
 * OAuth のエラーは原因ごとに対処が違う（再連携が要る／設定が違う）ので、
 * 何をすればよいかまで文言にする（docs/error-messages.md）。
 */
function describeOAuthError(json: unknown, status: number): string {
  const e = json as { error?: string; error_description?: string };
  const code = e?.error ?? `HTTP ${status}`;
  const detail = e?.error_description ? `（${e.error_description}）` : "";

  if (e?.error === "invalid_grant") {
    return `freee との接続が切れています。管理画面から接続し直してください${detail}`;
  }
  if (e?.error === "invalid_client") {
    return `freee のクライアント ID / シークレットが正しくありません${detail}`;
  }
  return `freee の認証に失敗しました: ${code}${detail}`;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("freee のアクセストークンが無効です（期限切れの可能性）");
    }
    throw new Error(`freee API がエラーを返しました: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** 認可したユーザーが属する事業所の一覧 */
export async function getCompanies(accessToken: string): Promise<FreeeCompany[]> {
  const json = await apiGet<{ companies: FreeeCompany[] }>("/api/1/companies", accessToken);
  return json.companies ?? [];
}

/**
 * 取引先の一覧。limit 最大値でページングして全件返す。
 *
 * @param startUpdateDate yyyy-mm-dd。指定すると「この日以降に更新された取引先」だけ
 *   に絞れる（差分同期）。**日付粒度**なので、取りこぼしを避けるため呼び出し側は
 *   前回同期日の 1 日前を渡すこと。
 */
export async function fetchPartners(params: {
  accessToken: string;
  freeeCompanyId: number;
  startUpdateDate?: string;
}): Promise<FreeePartner[]> {
  const all: FreeePartner[] = [];
  let offset = 0;

  for (;;) {
    const q = new URLSearchParams({
      company_id: String(params.freeeCompanyId),
      limit: String(PARTNERS_PAGE_LIMIT),
      offset: String(offset),
    });
    if (params.startUpdateDate) q.set("start_update_date", params.startUpdateDate);

    const json = await apiGet<{ partners: FreeePartner[] }>(
      `/api/1/partners?${q.toString()}`,
      params.accessToken
    );
    const page = json.partners ?? [];
    all.push(...page);

    if (page.length < PARTNERS_PAGE_LIMIT) break;
    offset += PARTNERS_PAGE_LIMIT;
  }

  return all;
}

// ---------------------------------------------------------------------------
// 書き込み（2026-08-04 追加）
//
// **自動では呼ばない。** 画面で人が差分を確認して確定したときだけ送る
// （docs/database-design.md §26）。会計データを触るため、
// 送った内容と結果は freee_sync_logs に必ず残すこと。
// ---------------------------------------------------------------------------

/** freee の取引先へ書ける項目。CRM にしか無いものは送らない */
export type FreeePartnerPayload = {
  name?: string;
  /** 取引先コード。CRM の事業者情報 UID を入れて対応付けを見えるようにする */
  code?: string | null;
  long_name?: string | null;
  name_kana?: string | null;
  phone?: string | null;
  invoice_registration_number?: string | null;
  address_attributes?: {
    zipcode?: string | null;
    prefecture_code?: number | null;
    street_name1?: string | null;
    street_name2?: string | null;
  };
};

async function apiSend<T>(
  path: string,
  method: "POST" | "PUT",
  accessToken: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("freee のアクセストークンが無効です（期限切れの可能性）");
    }
    if (res.status === 403) {
      throw new Error(
        "freee への書き込みが許可されていません。アプリの権限に取引先の更新が含まれているか確認してください"
      );
    }
    // freee は 400 の本文に理由を日本語で入れてくる。
    // JSON をそのまま画面に出すと読めないので、messages だけを取り出す
    throw new Error(
      `freee に拒否されました: ${describeFreeeValidationError(text, res.status)}`
    );
  }
  return (await res.json()) as T;
}

/**
 * freee のエラー本文から理由だけを取り出す。
 *
 * 例: {"status_code":400,"errors":[{"type":"validation","messages":["name が指定されていません。"]}]}
 *  → 「name が指定されていません。」
 *
 * 読めない形なら、切り分けに使えるよう本文の先頭を残す。
 */
export function describeFreeeValidationError(body: string, status: number): string {
  try {
    const json = JSON.parse(body) as {
      errors?: { messages?: string[] }[];
      message?: string;
    };
    const messages = (json.errors ?? [])
      .flatMap((e) => e.messages ?? [])
      .filter(Boolean);
    if (messages.length > 0) return messages.join(" / ");
    if (json.message) return json.message;
  } catch {
    // JSON でない場合は下へ
  }
  return `HTTP ${status} ${body.slice(0, 200)}`;
}

/** 取引先を新しく作る。CRM にあって freee に無い相手を登録するとき */
export async function createPartner(params: {
  accessToken: string;
  freeeCompanyId: number;
  payload: FreeePartnerPayload;
}): Promise<FreeePartner> {
  const json = await apiSend<{ partner: FreeePartner }>(
    "/api/1/partners",
    "POST",
    params.accessToken,
    { company_id: params.freeeCompanyId, ...params.payload }
  );
  return json.partner;
}

/**
 * 取引先を更新する。送った項目だけが変わるが、
 * **`name` だけは毎回必須**（省くと freee が 400 で
 * 「name が指定されていません。」を返す）。呼び出し側で必ず埋めること。
 */
export async function updatePartner(params: {
  accessToken: string;
  freeeCompanyId: number;
  freeePartnerId: number;
  payload: FreeePartnerPayload & { name: string };
}): Promise<FreeePartner> {
  const json = await apiSend<{ partner: FreeePartner }>(
    `/api/1/partners/${params.freeePartnerId}`,
    "PUT",
    params.accessToken,
    { company_id: params.freeeCompanyId, ...params.payload }
  );
  return json.partner;
}

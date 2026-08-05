/**
 * Google People API / OAuth の薄いクライアント。
 *
 * SDK（googleapis）は入れない。使うのは数エンドポイントだけで、依存を
 * 増やすほどの量ではない（Gmail 連携と同じ判断）。
 *
 * Google のリフレッシュトークンは freee と違い**ローテーションしない**。
 * 一度取れた値を使い続けられるので、保存の順序に freee ほど神経を使わない。
 * ただしアクセストークンは暗号化して保存し、期限内は再利用する。
 */

import { GOOGLE_CONTACTS_SCOPE } from "./config";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const PEOPLE_API_BASE = "https://people.googleapis.com/v1";

const FETCH_TIMEOUT_MS = 30_000;

/** 1 回の取得件数。People API の上限は 1000 */
const PAGE_SIZE = 500;

export type GoogleTokenResponse = {
  accessToken: string;
  /** リフレッシュ時は返らない（既存の値を使い続ける） */
  refreshToken: string | null;
  scope: string;
  expiresInSec: number;
  /** 認可したアカウントの素性。ドメイン検証に使う */
  idToken: string | null;
};

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * 認可画面の URL。
 *
 * `access_type=offline` と `prompt=consent` を必ず付ける。付けないと
 * リフレッシュトークンが返らず、アクセストークンが切れた時点で同期が止まる。
 *
 * `hd` は「このドメインのアカウントを選ばせる」ヒント。**強制ではない**ので
 * 受け取り側で必ず検証する（内部アプリ設定と合わせて多層防御）。
 */
export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  allowedDomain?: string | null;
  loginHint?: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: `openid email ${GOOGLE_CONTACTS_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    state: params.state,
  });
  if (params.allowedDomain) q.set("hd", params.allowedDomain);
  if (params.loginHint) q.set("login_hint", params.loginHint);
  return `${OAUTH_AUTH_URL}?${q.toString()}`;
}

async function requestToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(describeOAuthError(json, res.status));

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scope: json.scope ?? "",
    expiresInSec: json.expires_in ?? 3600,
    idToken: json.id_token ?? null,
  };
}

export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  return requestToken(
    new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    })
  );
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<GoogleTokenResponse> {
  return requestToken(
    new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
    })
  );
}

/**
 * OAuth のエラーは原因ごとに対処が違う（再連携が要る／設定が違う）ので、
 * 何をすればよいかまで文言にする（docs/error-messages.md）。
 */
function describeOAuthError(json: unknown, status: number): string {
  const e = json as { error?: string; error_description?: string };
  const detail = e?.error_description ? `（${e.error_description}）` : "";

  if (e?.error === "invalid_grant") {
    return `Google との接続が切れています。設定画面から接続し直してください${detail}`;
  }
  if (e?.error === "invalid_client") {
    return `Google のクライアント ID / シークレットが正しくありません${detail}`;
  }
  return `Google の認証に失敗しました: ${e?.error ?? `HTTP ${status}`}${detail}`;
}

/**
 * ID トークンからメールアドレスと組織ドメイン（hd）を取り出す。
 *
 * **署名は検証しない。** このトークンは今しがた自分で Google のトークン
 * エンドポイントへ TLS で問い合わせて受け取ったもので、第三者から渡された
 * ものではないため（Google の公式ガイダンスもこの経路では検証不要としている）。
 */
export function readIdToken(idToken: string): { email: string | null; hd: string | null } {
  const parts = idToken.split(".");
  if (parts.length < 2) return { email: null, hd: null };
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    ) as { email?: string; hd?: string };
    return {
      email: payload.email?.toLowerCase() ?? null,
      hd: payload.hd?.toLowerCase() ?? null,
    };
  } catch {
    return { email: null, hd: null };
  }
}

// ---------------------------------------------------------------------------
// People API
// ---------------------------------------------------------------------------

/** 取得・送信する項目。**ここに無い項目は Google 側の値をそのまま残す** */
export const PERSON_FIELDS =
  "names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,memberships,clientData,metadata";

export type GooglePerson = {
  resourceName: string;
  etag?: string;
  names?: {
    familyName?: string;
    middleName?: string;
    givenName?: string;
    phoneticFamilyName?: string;
    phoneticMiddleName?: string;
    phoneticGivenName?: string;
  }[];
  emailAddresses?: { value?: string; type?: string; metadata?: { primary?: boolean } }[];
  phoneNumbers?: { value?: string; type?: string; metadata?: { primary?: boolean } }[];
  addresses?: {
    type?: string;
    postalCode?: string;
    region?: string;
    city?: string;
    streetAddress?: string;
    extendedAddress?: string;
  }[];
  organizations?: { name?: string; department?: string; title?: string }[];
  /** 年なしで持てる。CRM は DATE なので年が無いものは取り込めない */
  birthdays?: { date?: { year?: number; month?: number; day?: number } }[];
  memberships?: { contactGroupMembership?: { contactGroupResourceName?: string } }[];
  clientData?: { key?: string; value?: string }[];
  metadata?: { deleted?: boolean };
};

async function apiFetch<T>(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(`${PEOPLE_API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GooglePeopleError(res.status, text);
  }
  // 削除系は空ボディを返す
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * People API のエラー。
 *
 * 呼び出し側が**状態コードで分岐する**（同期トークン失効は再取得、
 * 競合は差分画面へ、429 はバックオフ）ので、素の Error にしない。
 */
export class GooglePeopleError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(describePeopleError(status, body));
    this.name = "GooglePeopleError";
    this.status = status;
    this.body = body;
  }

  /** 同期トークンの失効（約 7 日）。全件取得からやり直す */
  get isExpiredSyncToken(): boolean {
    return this.status === 400 && this.body.includes("EXPIRED_SYNC_TOKEN");
  }

  /** 他所で更新されていた（etag 不一致）。上書きせず差分画面へ回す */
  get isConflict(): boolean {
    return this.status === 409 || this.status === 412;
  }

  /** 実行数の上限。時間を置いて再試行する */
  get isRateLimited(): boolean {
    return this.status === 429 || this.status === 503;
  }
}

function describePeopleError(status: number, body: string): string {
  if (status === 401) {
    return "Google のアクセストークンが無効です（期限切れの可能性）";
  }
  if (status === 403) {
    return "Google の連絡先へのアクセスが許可されていません。接続し直してください";
  }
  if (status === 429 || status === 503) {
    return "Google 側の実行数の上限に達しました。時間をおいて再度お試しください";
  }
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    if (json.error?.message) return `Google に拒否されました: ${json.error.message}`;
  } catch {
    // JSON でない場合は下へ
  }
  return `Google API がエラーを返しました: HTTP ${status} ${body.slice(0, 200)}`;
}

/**
 * 連絡先の一覧。**syncToken があれば差分だけ**返る。
 *
 * 差分取得では削除された連絡先が `metadata.deleted = true` で現れる。
 * 次回のために新しい syncToken を必ず持ち帰ること。
 */
export async function listConnections(params: {
  accessToken: string;
  syncToken?: string | null;
}): Promise<{ people: GooglePerson[]; nextSyncToken: string | null }> {
  const all: GooglePerson[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  for (;;) {
    const q = new URLSearchParams({
      personFields: PERSON_FIELDS,
      pageSize: String(PAGE_SIZE),
      requestSyncToken: "true",
    });
    if (params.syncToken) q.set("syncToken", params.syncToken);
    if (pageToken) q.set("pageToken", pageToken);

    const json = await apiFetch<{
      connections?: GooglePerson[];
      nextPageToken?: string;
      nextSyncToken?: string;
    }>(`/people/me/connections?${q.toString()}`, params.accessToken);

    all.push(...(json.connections ?? []));
    nextSyncToken = json.nextSyncToken ?? nextSyncToken;
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return { people: all, nextSyncToken };
}

export async function createContact(params: {
  accessToken: string;
  person: Partial<GooglePerson>;
}): Promise<GooglePerson> {
  return apiFetch<GooglePerson>(
    `/people:createContact?personFields=${PERSON_FIELDS}`,
    params.accessToken,
    { method: "POST", body: params.person }
  );
}

/**
 * 連絡先を更新する。
 *
 * **etag が必須。** 他所で更新されていれば Google が弾く（409/412）。
 * `updatePersonFields` に挙げた項目だけが対象で、**挙げていない項目は
 * Google 側の値がそのまま残る**（利用者がスマホで足した写真やメモを消さない）。
 */
export async function updateContact(params: {
  accessToken: string;
  resourceName: string;
  etag: string;
  person: Partial<GooglePerson>;
  updateFields: string;
}): Promise<GooglePerson> {
  const q = new URLSearchParams({
    updatePersonFields: params.updateFields,
    personFields: PERSON_FIELDS,
  });
  return apiFetch<GooglePerson>(
    `/${params.resourceName}:updateContact?${q.toString()}`,
    params.accessToken,
    { method: "PATCH", body: { ...params.person, etag: params.etag } }
  );
}

export async function deleteContact(params: {
  accessToken: string;
  resourceName: string;
}): Promise<void> {
  await apiFetch(`/${params.resourceName}:deleteContact`, params.accessToken, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// 連絡先グループ
//
// **同期対象はこのグループの中だけ**という境界を作る（§3）。
// ---------------------------------------------------------------------------

export type GoogleContactGroup = { resourceName: string; name?: string; formattedName?: string };

export async function listContactGroups(accessToken: string): Promise<GoogleContactGroup[]> {
  const json = await apiFetch<{ contactGroups?: GoogleContactGroup[] }>(
    "/contactGroups?pageSize=200",
    accessToken
  );
  return json.contactGroups ?? [];
}

export async function createContactGroup(params: {
  accessToken: string;
  name: string;
}): Promise<GoogleContactGroup> {
  return apiFetch<GoogleContactGroup>("/contactGroups", params.accessToken, {
    method: "POST",
    body: { contactGroup: { name: params.name } },
  });
}

/** グループへの追加・削除。1 回あたり 1000 件まで */
export async function modifyGroupMembers(params: {
  accessToken: string;
  groupResourceName: string;
  add?: string[];
  remove?: string[];
}): Promise<void> {
  await apiFetch(`/${params.groupResourceName}/members:modify`, params.accessToken, {
    method: "POST",
    body: {
      resourceNamesToAdd: params.add ?? [],
      resourceNamesToRemove: params.remove ?? [],
    },
  });
}

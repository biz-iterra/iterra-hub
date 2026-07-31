/**
 * Gmail API / Google OAuth の薄いクライアント。
 *
 * googleapis パッケージは入れない。使うのは数エンドポイントだけで、
 * 依存を 1 つ増やすほどの量ではない（バンドルも重い）。
 *
 * 制約: gmail.metadata スコープでは users.messages.list の `q`（検索クエリ）が
 * 使えない。期間指定で遡ることが API 側でできないため、ラベルと
 * ページングだけで絞る（設計書 § 20.5）。
 */

import { GMAIL_SCOPE } from "./config";

const OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type TokenResponse = {
  accessToken: string;
  /** 初回の認可でのみ返る。再認可では返らないことがある */
  refreshToken: string | null;
  scope: string;
  expiresInSec: number;
};

export type GmailProfile = {
  emailAddress: string;
  historyId: string;
};

/** messages.get(format=metadata) の必要部分 */
export type GmailMessageMeta = {
  id: string;
  threadId: string;
  internalDate: string;
  labelIds: string[];
  headers: Record<string, string>;
};

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * 認可画面の URL。
 *
 * access_type=offline と prompt=consent を必ず付ける。付けないと
 * リフレッシュトークンが返らず、アクセストークンが切れた時点で
 * 同期が止まる（再認可でも 2 回目以降は返らないため取りこぼすと厄介）。
 */
export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  /** 再連携時にアカウント選択を出したい場合に指定 */
  loginHint?: string;
}): string {
  const q = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: params.state,
  });
  if (params.loginHint) q.set("login_hint", params.loginHint);
  return `${OAUTH_AUTH_URL}?${q.toString()}`;
}

export async function exchangeCode(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(describeOAuthError(json, res.status));
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    scope: json.scope ?? "",
    expiresInSec: json.expires_in ?? 3600,
  };
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(describeOAuthError(json, res.status));
  }
  return {
    accessToken: json.access_token,
    refreshToken: null,
    scope: json.scope ?? "",
    expiresInSec: json.expires_in ?? 3600,
  };
}

/**
 * OAuth のエラーは原因ごとに対処が違う（再連携が要る／設定が違う）ので、
 * 何をすればよいかまで文言にする。
 */
function describeOAuthError(json: unknown, status: number): string {
  const e = json as { error?: string; error_description?: string };
  const code = e?.error ?? `HTTP ${status}`;
  const detail = e?.error_description ? `（${e.error_description}）` : "";

  if (e?.error === "invalid_grant") {
    return `連携の承認が失効しています。連携し直してください${detail}`;
  }
  if (e?.error === "redirect_uri_mismatch") {
    return `リダイレクト URI が Google Cloud 側の登録と一致しません${detail}`;
  }
  if (e?.error === "invalid_client") {
    return `クライアント ID / シークレットが正しくありません${detail}`;
  }
  return `Google の認証に失敗しました: ${code}${detail}`;
}

// ---------------------------------------------------------------------------
// Gmail API
// ---------------------------------------------------------------------------

async function gmailFetch(
  accessToken: string,
  path: string,
  query?: Record<string, string | string[] | undefined>
): Promise<unknown> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item) => q.append(k, item));
    else q.set(k, v);
  }
  const url = `${GMAIL_API}${path}${q.toString() ? `?${q}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (body as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(`Gmail API: ${message}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function getProfile(accessToken: string): Promise<GmailProfile> {
  const json = (await gmailFetch(accessToken, "/profile")) as {
    emailAddress: string;
    historyId: string;
  };
  return { emailAddress: json.emailAddress, historyId: String(json.historyId) };
}

/**
 * メッセージ ID の一覧。新しい順に返る。
 * gmail.metadata では q が使えないため、絞り込みは labelIds のみ。
 */
export async function listMessageIds(
  accessToken: string,
  params?: { labelIds?: string[]; maxResults?: number; pageToken?: string }
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const json = (await gmailFetch(accessToken, "/messages", {
    labelIds: params?.labelIds,
    maxResults: String(params?.maxResults ?? 100),
    pageToken: params?.pageToken,
  })) as {
    messages?: { id: string }[];
    nextPageToken?: string;
  };
  return {
    ids: (json.messages ?? []).map((m) => m.id),
    nextPageToken: json.nextPageToken ?? null,
  };
}

/** 必要なヘッダだけを取る。format=metadata では本文は返らない */
const WANTED_HEADERS = ["From", "To", "Cc", "Subject", "Date"];

export async function getMessageMetadata(
  accessToken: string,
  id: string
): Promise<GmailMessageMeta> {
  const json = (await gmailFetch(accessToken, `/messages/${id}`, {
    format: "metadata",
    metadataHeaders: WANTED_HEADERS,
  })) as {
    id: string;
    threadId: string;
    internalDate: string;
    labelIds?: string[];
    payload?: { headers?: { name: string; value: string }[] };
  };

  const headers: Record<string, string> = {};
  for (const h of json.payload?.headers ?? []) {
    // ヘッダ名の大小は送信側次第なので小文字で正規化して引けるようにする
    headers[h.name.toLowerCase()] = h.value;
  }

  return {
    id: json.id,
    threadId: json.threadId,
    internalDate: json.internalDate,
    labelIds: json.labelIds ?? [],
    headers,
  };
}

/**
 * 差分同期。startHistoryId 以降に増えたメッセージ ID を返す。
 *
 * historyId は Gmail 側で数日〜1 週間程度しか保持されない。失効すると
 * 404 が返るので、呼び出し側は全件走査へフォールバックすること。
 */
export async function listAddedMessageIds(
  accessToken: string,
  startHistoryId: string
): Promise<{ ids: string[]; historyId: string | null; expired: boolean }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let historyId: string | null = null;

  try {
    do {
      const json = (await gmailFetch(accessToken, "/history", {
        startHistoryId,
        historyTypes: "messageAdded",
        pageToken,
      })) as {
        history?: { messagesAdded?: { message: { id: string } }[] }[];
        historyId?: string;
        nextPageToken?: string;
      };

      for (const h of json.history ?? []) {
        for (const added of h.messagesAdded ?? []) ids.add(added.message.id);
      }
      historyId = json.historyId ? String(json.historyId) : historyId;
      pageToken = json.nextPageToken;
    } while (pageToken);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) return { ids: [], historyId: null, expired: true };
    throw e;
  }

  return { ids: [...ids], historyId, expired: false };
}

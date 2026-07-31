/**
 * Gmail 連携の設定。
 *
 * 環境変数が未設定でもビルド・起動は通す。未設定なら連携メニューに
 * その旨を出すだけにして、他の機能を巻き込まない。
 */

export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  /** リフレッシュトークンの暗号化鍵。値そのものはここから外に出さない */
  encryptionKey: string;
};

/**
 * 要求するスコープ。**メタデータのみ。**
 * 本文・添付を取得できる権限は要求しない（設計書 § 20.2）。
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.metadata";

/** 未設定なら null。呼び出し側で「未設定」表示に分岐する */
export function getGmailConfig(): GmailConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();

  if (!clientId || !clientSecret || !encryptionKey) return null;
  return { clientId, clientSecret, encryptionKey };
}

/** 画面から設定状況だけを知りたいとき。値は返さない */
export function isGmailConfigured(): boolean {
  return getGmailConfig() !== null;
}

/**
 * 定期同期エンドポイントの合言葉。
 *
 * Cookie 認証はマシンからの実行に使えないため Bearer で照合する。
 * 未設定ならエンドポイント自体を無効にする（開発機では設定不要。
 * 手動の「同期」ボタンで足りる）。
 */
export function getSyncCronSecret(): string | null {
  const secret = process.env.GMAIL_SYNC_CRON_SECRET?.trim();
  return secret ? secret : null;
}

/**
 * コールバック URL。
 *
 * 環境ごとに固定値を持たず、リクエストの origin から組み立てる。
 * 開発機（http://localhost:2000）と本番（https://hub.iterra.online）で
 * 別の環境変数を用意しなくて済む。Google Cloud 側には両方の URI を
 * 登録しておくこと（登録が無いと redirect_uri_mismatch になる）。
 */
export function gmailRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/gmail/callback`;
}

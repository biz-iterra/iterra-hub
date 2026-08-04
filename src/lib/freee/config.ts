/**
 * freee 会計連携の設定。
 *
 * 環境変数が未設定でもビルド・起動は通す。未設定なら管理画面に
 * その旨を出すだけにして、他の機能を巻き込まない（Gmail 連携と同じ方針）。
 */

export type FreeeConfig = {
  clientId: string;
  clientSecret: string;
  /** トークンの暗号化鍵。値そのものはここから外に出さない */
  encryptionKey: string;
};

/** 未設定なら null。呼び出し側で「未設定」表示に分岐する */
export function getFreeeConfig(): FreeeConfig | null {
  const clientId = process.env.FREEE_CLIENT_ID?.trim();
  const clientSecret = process.env.FREEE_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.FREEE_TOKEN_ENCRYPTION_KEY?.trim();

  if (!clientId || !clientSecret || !encryptionKey) return null;
  return { clientId, clientSecret, encryptionKey };
}

/** 画面から設定状況だけを知りたいとき。値は返さない */
export function isFreeeConfigured(): boolean {
  return getFreeeConfig() !== null;
}

/**
 * 定期同期エンドポイントの合言葉。
 *
 * Cookie 認証はマシンからの実行に使えないため Bearer で照合する。
 * 未設定ならエンドポイント自体を無効にする（開発機では設定不要。
 * 手動の「同期」ボタンで足りる）。
 */
export function getFreeeSyncCronSecret(): string | null {
  const secret = process.env.FREEE_SYNC_CRON_SECRET?.trim();
  return secret ? secret : null;
}

/**
 * コールバック URL。
 *
 * 環境ごとに固定値を持たず、リクエストの origin から組み立てる。
 * freee の開発者コンソールには開発機（http://localhost:2000/api/freee/callback）と
 * 本番（https://hub.iterra.online/api/freee/callback）の両方を登録しておくこと
 * （登録が無いと redirect_uri の不一致で認可が通らない）。
 */
export function freeeRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/freee/callback`;
}

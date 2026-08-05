/**
 * Google コンタクト連携の設定。
 *
 * 環境変数が未設定でもビルド・起動は通す。未設定なら画面にその旨を出すだけにして、
 * 他の機能を巻き込まない（Gmail 連携と同じ方針）。
 *
 * **OAuth クライアントは Gmail と分ける。** 同意画面の「内部 / 外部」は
 * GCP プロジェクト単位で決まる。Gmail 連携は共有メールボックス等で組織外の
 * アカウントも繋ぐため「外部」のままにする必要があり、会社アカウント限定に
 * したいコンタクト連携（内部アプリ）と同居できない（docs/google-contacts-sync.md §2）。
 */

export type GoogleContactsConfig = {
  clientId: string;
  clientSecret: string;
  /** トークンの暗号化鍵。値そのものはここから外に出さない */
  encryptionKey: string;
  /**
   * 接続を許す Workspace のドメイン。
   *
   * Google 側でも内部アプリにして組織外を弾くが、**アプリ側でも検証する**
   * （多層防御）。未設定ならドメイン検証を行わない
   */
  allowedDomain: string | null;
};

/**
 * 要求するスコープ。**連絡先の読み書きのみ。**
 *
 * `contacts.readonly` では push できず、`contacts.other.readonly`（自動収集の
 * 「その他の連絡先」）は対象外なので要求しない。
 */
export const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";

/** 未設定なら null。呼び出し側で「未設定」表示に分岐する */
export function getGoogleContactsConfig(): GoogleContactsConfig | null {
  const clientId = process.env.GOOGLE_CONTACTS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CONTACTS_CLIENT_SECRET?.trim();
  const encryptionKey = process.env.GOOGLE_CONTACTS_TOKEN_ENCRYPTION_KEY?.trim();
  const allowedDomain = process.env.GOOGLE_CONTACTS_ALLOWED_DOMAIN?.trim();

  if (!clientId || !clientSecret || !encryptionKey) return null;
  return {
    clientId,
    clientSecret,
    encryptionKey,
    allowedDomain: allowedDomain ? allowedDomain.toLowerCase() : null,
  };
}

/** 画面から設定状況だけを知りたいとき。値は返さない */
export function isGoogleContactsConfigured(): boolean {
  return getGoogleContactsConfig() !== null;
}

/**
 * 定期同期エンドポイントの合言葉。
 *
 * Cookie 認証はマシンからの実行に使えないため Bearer で照合する。
 * 未設定ならエンドポイント自体を無効にする（Gmail / freee と同じ）。
 */
export function getGoogleContactsSyncCronSecret(): string | null {
  const secret = process.env.GOOGLE_CONTACTS_SYNC_CRON_SECRET?.trim();
  return secret ? secret : null;
}

/**
 * コールバック URL。
 *
 * 環境ごとに固定値を持たず、リクエストの origin から組み立てる
 * （Gmail と同じ。Google Cloud 側には開発機と本番の両方を登録しておく）。
 */
export function googleContactsRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/google-contacts/callback`;
}

/**
 * CRM が管理する連絡先を入れるグループの名前。
 *
 * **同期対象はこのグループの中だけ**という規約にしている（§3）。
 * 利用者の個人的な連絡先に触れないための境界であり、
 * 切断時の一括回収の単位でもある。
 */
export const CONTACT_GROUP_NAME = "ITERRA CRM";

/**
 * Google 連絡先へ刻む CRM 側の識別子のキー（`clientData`）。
 *
 * リンク表が壊れても対応を復元でき、Google 側からも対応が見える
 * （freee の取引先コードと同じ思想）。
 */
export const CLIENT_DATA_KEY = "iterra_contact_code";

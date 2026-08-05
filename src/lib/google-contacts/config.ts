/**
 * Google コンタクト連携の設定。
 *
 * 環境変数が未設定でもビルド・起動は通す。未設定なら画面にその旨を出すだけにして、
 * 他の機能を巻き込まない（Gmail 連携と同じ方針）。
 *
 * **GCP プロジェクトは Gmail 連携と同じものを使い、OAuth クライアントだけ分ける。**
 * 同意画面（内部 / 外部）はプロジェクト単位だが、Gmail 連携も「内部」なので同居できる
 * （database-design.md §20.4）。クライアントを分けるのは、Gmail の認可 URL が
 * `include_granted_scopes: "true"` で過去のスコープを引き継ぐため。共用すると
 * Gmail の再連携時に contacts の権限まで引きずり、`granted_scope` の逸脱監査が
 * 意味を失う（docs/google-contacts-sync.md §2）。
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
 * 要求するスコープ。
 *
 * **同意画面には「連絡先の表示、編集、ダウンロード、完全な削除」と出る。**
 * People API で**書き込めるスコープはこれ 1 つだけ**で、
 * 「書き込みのみ」「特定のグループのみ」といった絞り込みは用意されていない
 * （`contacts.readonly` は読み取り専用、`contacts.other.readonly` は
 * 自動収集された「その他の連絡先」用で、どちらも push に使えない）。
 *
 * つまり**技術的には利用者の全連絡先を消せる権限**を受け取ることになる。
 * 実際に触る範囲は「ITERRA CRM」グループの中だけに**アプリ側で**限っているが、
 * それは Google が保証する制限ではない（§2.1）。利用者には同意画面に何が出るかを
 * 事前に伝えること。
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

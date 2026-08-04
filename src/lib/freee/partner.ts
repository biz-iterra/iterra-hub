/**
 * freee 取引先（Partner）の変換ロジック。
 *
 * ここは DB・ネットワークに触れない純粋関数だけを置く（Vitest の対象）。
 * API レスポンスの形は freee 公開の OpenAPI スキーマ
 * （freee/freee-api-schema の /api/1/partners）に基づく。
 */

/** freee API の Partner レスポンス（使う項目のみ） */
export type FreeePartner = {
  id: number;
  company_id: number;
  name: string;
  code?: string | null;
  long_name?: string | null;
  name_kana?: string | null;
  /** null: 未設定 / 1: 法人 / 2: 個人 */
  org_code?: number | null;
  country_code?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  email?: string | null;
  qualified_invoice_issuer?: boolean | null;
  invoice_registration_number?: string | null;
  address_attributes?: {
    zipcode?: string | null;
    prefecture_code?: number | null;
    street_name1?: string | null;
    street_name2?: string | null;
  } | null;
  /** false = freee 側で使用停止 */
  available: boolean;
  /** yyyy-mm-dd */
  update_date: string;
};

/** upsert_freee_partners（DB 関数）へ渡す 1 行 */
export type FreeePartnerRow = {
  freee_partner_id: number;
  name: string;
  code: string | null;
  long_name: string | null;
  name_kana: string | null;
  org_code: number | null;
  country_code: string | null;
  phone: string | null;
  contact_name: string | null;
  email: string | null;
  qualified_invoice_issuer: boolean | null;
  invoice_registration_number: string | null;
  address_zipcode: string | null;
  address_prefecture_code: number | null;
  address_street_name1: string | null;
  address_street_name2: string | null;
  available: boolean;
  freee_update_date: string | null;
};

/** インボイス登録番号の形式（T + 13 桁）か */
export function isValidInvoiceNumber(value: string | null | undefined): boolean {
  return typeof value === "string" && /^T\d{13}$/.test(value.trim());
}

/**
 * インボイス登録番号から法人番号を導出する。
 *
 * **法人（orgCode = 1）のときだけ。** 法人のインボイス番号は
 * 「T + 法人番号 13 桁」だが、個人事業主（orgCode = 2）の T 番号は
 * 独自採番であり法人番号ではない。未設定（null）も法人と確認できないので
 * 導出しない。
 */
export function deriveCorporateNumber(
  orgCode: number | null | undefined,
  invoiceNumber: string | null | undefined
): string | null {
  if (orgCode !== 1) return null;
  if (!isValidInvoiceNumber(invoiceNumber)) return null;
  return invoiceNumber!.trim().slice(1);
}

/** 空文字・空白だけの値を null に潰す（freee は未入力を "" で返すことがある） */
function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * freee の日付（yyyy-mm-dd）をそのまま通す。形式が崩れていたら null
 * （DB の DATE キャストで落ちるより、日付なしで取り込む方が良い）。
 */
function cleanDate(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** API レスポンス → DB 関数へ渡す行 */
export function toPartnerRow(partner: FreeePartner): FreeePartnerRow {
  const addr = partner.address_attributes ?? null;
  // freee の prefecture_code は 0（北海道）〜 46（沖縄県）。-1 は「設定しない」
  const pref =
    typeof addr?.prefecture_code === "number" &&
    addr.prefecture_code >= 0 &&
    addr.prefecture_code <= 46
      ? addr.prefecture_code
      : null;

  const invoice = clean(partner.invoice_registration_number);

  return {
    freee_partner_id: partner.id,
    name: partner.name,
    code: clean(partner.code),
    long_name: clean(partner.long_name),
    name_kana: clean(partner.name_kana),
    org_code:
      partner.org_code === 1 || partner.org_code === 2 ? partner.org_code : null,
    country_code: clean(partner.country_code),
    phone: clean(partner.phone),
    contact_name: clean(partner.contact_name),
    email: clean(partner.email),
    qualified_invoice_issuer: partner.qualified_invoice_issuer ?? null,
    // 形式外の値（入力ミス等）は持ち込まない。導出列の誤爆も防ぐ
    invoice_registration_number: isValidInvoiceNumber(invoice) ? invoice : null,
    address_zipcode: clean(addr?.zipcode),
    address_prefecture_code: pref,
    address_street_name1: clean(addr?.street_name1),
    address_street_name2: clean(addr?.street_name2),
    available: partner.available !== false,
    freee_update_date: cleanDate(partner.update_date),
  };
}

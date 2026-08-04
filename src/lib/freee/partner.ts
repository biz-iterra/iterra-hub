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

  // ---- ここから下は CRM に正本が無い項目（ミラーとして持つだけ）----
  shortcut1?: string | null;
  shortcut2?: string | null;
  /** 敬称（御中 / 様 / 空白） */
  default_title?: string | null;
  payer_walletable_id?: number | null;
  /** payer: 振込元（当方）/ payee: 振込先（先方） */
  transfer_fee_handling_side?: string | null;
  partner_doc_setting_attributes?: {
    sending_method?: string | null;
  } | null;
  /** CRM の financial_info と対応する */
  partner_bank_account_attributes?: {
    bank_name?: string | null;
    bank_name_kana?: string | null;
    bank_code?: string | null;
    branch_name?: string | null;
    branch_kana?: string | null;
    branch_code?: string | null;
    /** ordinary / checking / earmarked / savings */
    account_type?: string | null;
    account_number?: string | null;
    /** 口座名義（カナ） */
    account_name?: string | null;
    /** 口座名義 */
    long_account_name?: string | null;
  } | null;
  /** 支払条件。締日は月末を 32 で表す */
  payment_term_attributes?: {
    cutoff_day?: number | null;
    additional_months?: number | null;
    fixed_day?: number | null;
  } | null;
  /** 請求条件 */
  invoice_payment_term_attributes?: {
    cutoff_day?: number | null;
    additional_months?: number | null;
    fixed_day?: number | null;
  } | null;
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

  // CRM に正本が無い項目。ミラーとして持ち、突合画面で参照できるようにする
  shortcut1: string | null;
  shortcut2: string | null;
  default_title: string | null;
  payer_walletable_id: number | null;
  transfer_fee_handling_side: string | null;
  doc_sending_method: string | null;
  bank_name: string | null;
  bank_name_kana: string | null;
  bank_code: string | null;
  branch_name: string | null;
  branch_kana: string | null;
  branch_code: string | null;
  account_type: string | null;
  account_number: string | null;
  account_name: string | null;
  long_account_name: string | null;
  payment_cutoff_day: number | null;
  payment_additional_months: number | null;
  payment_fixed_day: number | null;
  invoice_cutoff_day: number | null;
  invoice_additional_months: number | null;
  invoice_fixed_day: number | null;
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
  const bank = partner.partner_bank_account_attributes ?? null;
  const pay = partner.payment_term_attributes ?? null;
  const inv = partner.invoice_payment_term_attributes ?? null;

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

    shortcut1: clean(partner.shortcut1),
    shortcut2: clean(partner.shortcut2),
    default_title: clean(partner.default_title),
    payer_walletable_id: partner.payer_walletable_id ?? null,
    transfer_fee_handling_side: clean(partner.transfer_fee_handling_side),
    doc_sending_method: clean(partner.partner_doc_setting_attributes?.sending_method),

    bank_name: clean(bank?.bank_name),
    bank_name_kana: clean(bank?.bank_name_kana),
    bank_code: clean(bank?.bank_code),
    branch_name: clean(bank?.branch_name),
    branch_kana: clean(bank?.branch_kana),
    branch_code: clean(bank?.branch_code),
    account_type: clean(bank?.account_type),
    account_number: clean(bank?.account_number),
    account_name: clean(bank?.account_name),
    long_account_name: clean(bank?.long_account_name),

    payment_cutoff_day: pay?.cutoff_day ?? null,
    payment_additional_months: pay?.additional_months ?? null,
    payment_fixed_day: pay?.fixed_day ?? null,
    invoice_cutoff_day: inv?.cutoff_day ?? null,
    invoice_additional_months: inv?.additional_months ?? null,
    invoice_fixed_day: inv?.fixed_day ?? null,
  };
}

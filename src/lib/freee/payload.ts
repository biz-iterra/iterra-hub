/**
 * 差分画面で選ばれた項目から、freee の**更新** API へ送る本体を組み立てる。
 *
 * Server Action から切り出してあるのは、ここが「送ってよい項目の関所」だから。
 * 元は Server Action の中に `Record<string, unknown>` で書かれており、freee が
 * 更新では受け付けない `code` を混ぜても型もテストも素通りしていた。結果、
 * 取引先コードを選ぶと 400「このAPIでは code の指定はできません。」で
 * **その回の全項目**が落ちていた（2026-08-05 の不具合報告）。
 *
 * 変換表は DB 側（取り込み）と対になっている。**片方だけ直さないこと**（§26.11）。
 */

import { freeePrefectureCode } from "./prefecture";
import { crmAccountTypeToFreee } from "./account-type";
import type { FreeePartnerCreatePayload, FreeePartnerPayload } from "./client";

/** 差分 1 項目。detect_freee_partner_diffs が返す形の必要な部分だけ */
export type FreeeDiffField = { field: string; crm: string | null };

/**
 * **freee へ反映できない項目。** 選ばれても送らない。
 *
 * - `code`（取引先コード）: 更新 API に無く、新規登録のときしか指定できない。
 *   既存の相手に入れるときは freee の画面か CSV インポートで行う（§26.8）
 */
export const NOT_UPDATABLE_FIELDS: readonly string[] = ["code"];

/**
 * 敬称の既定値。**DB 側（`freee_default_title()`）と対で持つ**。
 * 片方だけ直すと、差分画面が提案する値と実際に送る値が食い違う。
 *
 * freee が受け付けるのは「御中 / 様 / (空白)」の 3 つだけ。
 */
export const DEFAULT_TITLE = "様";

export function buildFreeeUpdatePayload(
  fields: readonly FreeeDiffField[]
): FreeePartnerPayload {
  const payload: FreeePartnerPayload = {};

  for (const f of fields) {
    if (NOT_UPDATABLE_FIELDS.includes(f.field)) continue;

    switch (f.field) {
      case "name":
        // **基本情報の「名前」と書類の「正式名称」の両方**に会社名を入れる。
        // 片方だけだと freee 側で表記がばらつく（2026-08-05 の指摘）。
        // **空では送らない**（freee は name 必須で、空だと更新全体が 400 になる）
        if (f.crm) {
          payload.name = f.crm;
          payload.long_name = f.crm;
        }
        break;
      case "name_kana":
        // 入るのは書類の「正式名称（カナ）」。基本情報の「名前（ふりがな）」は
        // API に項目が無く設定できない（§26.8.1）
        payload.name_kana = f.crm;
        break;
      case "default_title":
        // 敬称。**「御中 / 様 / (空白)」の 3 択**。未設定のときだけ差分に出る
        payload.default_title = f.crm;
        break;
      case "phone":
        payload.phone = f.crm;
        break;
      case "invoice_registration_number":
        payload.invoice_registration_number = f.crm;
        break;
      case "zipcode":
        payload.address_attributes = { ...payload.address_attributes, zipcode: f.crm };
        break;
      case "prefecture":
        // freee は都道府県をコードで持つ（0: 北海道 〜 46: 沖縄県）
        payload.address_attributes = {
          ...payload.address_attributes,
          prefecture_code: freeePrefectureCode(f.crm),
        };
        break;
      case "street":
        // **CRM は市区町村と番地が別、freee は 1 項目**。
        // 差分の crm 値は既に連結済みなのでそのまま送る
        payload.address_attributes = {
          ...payload.address_attributes,
          street_name1: f.crm,
        };
        break;
      case "building":
        payload.address_attributes = {
          ...payload.address_attributes,
          street_name2: f.crm,
        };
        break;
      case "qualified_invoice_issuer":
        // 画面には「該当する / 該当しない」で出しているので真偽値へ戻す
        payload.qualified_invoice_issuer = f.crm === "該当する";
        break;
      case "org_code":
        payload.org_code = f.crm === "個人" ? 2 : 1;
        break;
      case "contact_name":
        // **姓・ミドル名・名を続けたもの**（DB 側で組み立て済み）
        payload.contact_name = f.crm;
        break;
      case "email":
        payload.email = f.crm;
        break;
      case "bank_name":
      case "branch_name":
      case "account_number":
      case "account_holder":
      case "account_type": {
        // freee は口座をまとめて受け取る。**送る分だけ組み立てる**
        const bank = { ...payload.partner_bank_account_attributes };
        if (f.field === "bank_name") bank.bank_name = f.crm;
        if (f.field === "branch_name") bank.branch_name = f.crm;
        if (f.field === "account_number") bank.account_number = f.crm;
        if (f.field === "account_holder") bank.long_account_name = f.crm;
        if (f.field === "account_type") bank.account_type = crmAccountTypeToFreee(f.crm);
        payload.partner_bank_account_attributes = bank;
        break;
      }
      default:
        break;
    }
  }

  return payload;
}

// ---------------------------------------------------------------------------
// 新規登録（POST）
//
// 更新と違い **`code`（取引先コード）を入れられるのはここだけ**。
// 事業所側で取引先コードを「使用する」にしているため指定は必須で、
// 省くと 400「Codeを入力してください。」が返る（§26.8）。
// ---------------------------------------------------------------------------

/** `get_company_freee_source()` が返す CRM 側の値一式 */
export type FreeeCompanySource = {
  company_id: string;
  company_code: string | null;
  name: string;
  name_kana: string | null;
  phone: string | null;
  invoice_registration_number: string | null;
  invoice_registered: boolean;
  /** 1: 法人 / 2: 個人。法人格が未設定なら null（送らない） */
  org_code: number | null;
  contact_name: string | null;
  contact_email: string | null;
  zipcode: string | null;
  prefecture: string | null;
  street: string | null;
  building: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  account_type: string | null;
};

/** 空文字・空白だけの値は「無い」とみなす（freee に空文字を送らない） */
function present(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}

/**
 * 新規登録の本体を組み立てる。
 *
 * **値が無い項目は入れない。** 更新は「空を送って消す」意味があるが、
 * 登録では単に持っていないだけなので、送ると freee 側に空欄を作ることになる。
 */
export function buildFreeeCreatePayload(
  source: FreeeCompanySource
): FreeePartnerCreatePayload {
  const payload: FreeePartnerCreatePayload = {
    // **基本情報の「名前」と書類の「正式名称」の両方**に会社名を入れる
    name: source.name,
    long_name: source.name,
    // 敬称。CRM に項目が無いので既定の「様」を入れる
    // （未設定だと書類の宛名が敬称なしになる。2026-08-05 の依頼）
    default_title: DEFAULT_TITLE,
  };

  // 取引先コード。これを入れるために新規登録の経路がある
  const code = present(source.company_code);
  if (code) payload.code = code;

  // 入るのは書類の「正式名称（カナ）」。基本情報の「名前（ふりがな）」は
  // API に項目が無いため設定できない（§26.8.1）
  const kana = present(source.name_kana);
  if (kana) payload.name_kana = kana;

  const phone = present(source.phone);
  if (phone) payload.phone = phone;

  const invoice = present(source.invoice_registration_number);
  if (invoice) payload.invoice_registration_number = invoice;
  // 番号が無いのに「該当する」を送ると freee 側で不整合になる
  if (invoice || source.invoice_registered) {
    payload.qualified_invoice_issuer = source.invoice_registered;
  }

  if (source.org_code === 1 || source.org_code === 2) {
    payload.org_code = source.org_code;
  }

  const contactName = present(source.contact_name);
  if (contactName) payload.contact_name = contactName;

  const email = present(source.contact_email);
  if (email) payload.email = email;

  // 住所。freee は 1 つの属性でまとめて受け取る
  const zipcode = present(source.zipcode);
  const prefectureCode = freeePrefectureCode(source.prefecture);
  const street = present(source.street);
  const building = present(source.building);
  if (zipcode || prefectureCode !== null || street || building) {
    payload.address_attributes = {};
    if (zipcode) payload.address_attributes.zipcode = zipcode;
    if (prefectureCode !== null) {
      payload.address_attributes.prefecture_code = prefectureCode;
    }
    if (street) payload.address_attributes.street_name1 = street;
    if (building) payload.address_attributes.street_name2 = building;
  }

  // 口座。当座の綴りが CRM と違う（current → checking）ので必ず変換を通す
  const bankName = present(source.bank_name);
  const branchName = present(source.branch_name);
  const accountNumber = present(source.account_number);
  const accountHolder = present(source.account_holder);
  const accountType = crmAccountTypeToFreee(source.account_type);
  if (bankName || branchName || accountNumber || accountHolder || accountType) {
    payload.partner_bank_account_attributes = {};
    const bank = payload.partner_bank_account_attributes;
    if (bankName) bank.bank_name = bankName;
    if (branchName) bank.branch_name = branchName;
    if (accountNumber) bank.account_number = accountNumber;
    if (accountHolder) bank.long_account_name = accountHolder;
    if (accountType) bank.account_type = accountType;
  }

  return payload;
}

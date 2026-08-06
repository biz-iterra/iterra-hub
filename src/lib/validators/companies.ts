import { z } from "zod";
import { expectedUpdatedAtSchema, uuidString } from "./common";

const companyBaseSchema = z.object({
  name: z.string().min(1, "会社名は必須です").max(200),
  name_kana: z.string().max(200).nullable().optional(),
  corporate_type_id: uuidString().nullable().optional(),
  /** 会社名（法人のとき）。事業者名（name）とは別に保持する */
  corporate_name: z.string().max(200).nullable().optional(),
  /** 屋号名（個人事業主のとき）。屋号を持たない事業主では空 */
  trade_name: z.string().max(200).nullable().optional(),
  representative_name: z.string().max(100).nullable().optional(),
  corporate_number: z.string().regex(/^\d{13}$/, "法人番号は13桁の数字です").nullable().optional(),
  invoice_registered: z.boolean().default(false),
  invoice_registration_number: z.string().regex(/^T\d{13}$/, "T+13桁の数字です").nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  fax: z.string().max(20).nullable().optional(),
  website_url: z.string().url("有効なURLを入力してください").nullable().optional(),
  industry_classification_id: uuidString().nullable().optional(),
  registration_certificate_url: z.string().url().nullable().optional(),
  internal_memo: z.string().max(2000).nullable().optional(),
  lead_source_id: uuidString().nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
  primary_contact_id: uuidString().nullable().optional(),
  /** 代表者の連絡先。これがあれば氏名はこちらから引く（representative_name は自由入力の逃げ道） */
  representative_contact_id: uuidString().nullable().optional(),
  company_status_id: uuidString("ステータスは必須です"),
});

export const createCompanySchema = companyBaseSchema.refine(
  (data) => !data.invoice_registered || !!data.invoice_registration_number,
  { message: "インボイス登録ありの場合、登録番号は必須です", path: ["invoice_registration_number"] }
);

export const updateCompanySchema = companyBaseSchema
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema });

// ---------------------------------------------------------------------------
// 法人ドメイン（company_domains）
//
// 正規化（小文字化・www 除去・メール/URL からの抽出）は DB の normalize_domain
// が行うため、ここでは「何か入力されているか」だけを見る。
// メールアドレスや URL を貼り付けてもそのまま受け付ける。
// ---------------------------------------------------------------------------
export const createCompanyDomainSchema = z.object({
  company_id: uuidString(),
  domain: z.string().min(1, "ドメインを入力してください").max(253),
  is_primary: z.boolean().optional(),
});
/**
 * 兼務（company_contacts）。
 *
 * **主たる所属は `contacts.company_id` が持つ。** ここに入れるのは
 * 「それ以外に関わる事業者」だけで、同じ事業者は DB のトリガーが拒む。
 */
export const companyAffiliationSchema = z.object({
  contact_id: uuidString("連絡先を指定してください"),
  company_id: uuidString("事業者情報を選んでください"),
  job_title: z
    .string()
    .max(100, "[job_title] 役職は100文字以内で入力してください")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

/**
 * 連携プロファイル（事業者情報 × 連携先）。
 *
 * **すべての参照は任意。** null は「既定に従う」を意味する
 * （主担当・主メール・主住所・主口座・代表電話）。
 * 選べる範囲は DB のトリガーが縛る（`check_company_integration_profile`）。
 */
export const companyIntegrationProfileSchema = z.object({
  company_id: uuidString("事業者情報を指定してください"),
  integration: z.enum(["freee"], { error: "対応していない連携先です" }),
  contact_id: uuidString().nullable().optional(),
  contact_email_id: uuidString().nullable().optional(),
  entity_address_id: uuidString().nullable().optional(),
  phone_entity_address_id: uuidString().nullable().optional(),
  financial_info_id: uuidString().nullable().optional(),
});

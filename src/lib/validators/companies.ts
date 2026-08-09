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

/**
 * 個人事業主の作成時に同時に作る「本人の連絡先」の下書き（T-0087）。
 *
 * 個人事業主は定義上本人が必ずいるのに、手入力での作成が連絡先を 1 件も作らず
 * 事業主欄が空のまま運用されていた（T-0086）。作成と同時に本人を登録し、
 * 事業主・主担当へ紐づける。書き込みは DB 関数 `create_company_with_contact` が行う。
 *
 * **姓名の制約は `contacts` と同じにする。** ここだけ緩いと、同じ連絡先が
 * 作成経路によって通ったり弾かれたりする。
 * ステータス・事業者・担当者は DB 関数が決めるのでここでは受け取らない。
 */
export const companyRepresentativeDraftSchema = z.object({
  last_name: z.string().trim().min(1, "姓は必須です").max(50, "姓は50文字以内で入力してください"),
  first_name: z.string().trim().min(1, "名は必須です").max(50, "名は50文字以内で入力してください"),
  last_name_kana: z
    .string()
    .trim()
    .max(50, "セイは50文字以内で入力してください")
    .nullable()
    .optional(),
  first_name_kana: z
    .string()
    .trim()
    .max(50, "メイは50文字以内で入力してください")
    .nullable()
    .optional(),
});

export const createCompanySchema = companyBaseSchema
  .extend({
    /**
     * 同時に作る本人の連絡先。**省略・null なら会社だけを作る**
     * （同時作成のチェックを外した場合。必須にはしない。氏名が分からない場面で
     * 仮名を入れて通す運用に化けるため。外したものは整合性検査 Q15 が拾う）
     */
    representative: companyRepresentativeDraftSchema.nullable().optional(),
  })
  .refine(
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

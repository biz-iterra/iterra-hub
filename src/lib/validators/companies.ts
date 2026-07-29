import { z } from "zod";
import { expectedUpdatedAtSchema, uuidString } from "./common";

const companyBaseSchema = z.object({
  name: z.string().min(1, "会社名は必須です").max(200),
  name_kana: z.string().max(200).nullable().optional(),
  corporate_type_id: uuidString().nullable().optional(),
  representative_name: z.string().max(100).nullable().optional(),
  corporate_number: z.string().regex(/^\d{13}$/, "法人番号は13桁の数字です").nullable().optional(),
  invoice_registered: z.boolean().default(false),
  invoice_registration_number: z.string().regex(/^T\d{13}$/, "T+13桁の数字です").nullable().optional(),
  postal_code: z.string().regex(/^\d{3}-\d{4}$/, "000-0000形式で入力してください").nullable().optional(),
  prefecture: z.string().nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  address_line1: z.string().max(200).nullable().optional(),
  address_line2: z.string().max(200).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  fax: z.string().max(20).nullable().optional(),
  website_url: z.string().url("有効なURLを入力してください").nullable().optional(),
  industry_classification_id: uuidString().nullable().optional(),
  registration_certificate_url: z.string().url().nullable().optional(),
  internal_memo: z.string().max(2000).nullable().optional(),
  lead_source_id: uuidString().nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
  primary_contact_id: uuidString().nullable().optional(),
  company_status_id: uuidString("ステータスは必須です"),
});

export const createCompanySchema = companyBaseSchema.refine(
  (data) => !data.invoice_registered || !!data.invoice_registration_number,
  { message: "インボイス登録ありの場合、登録番号は必須です", path: ["invoice_registration_number"] }
);

export const updateCompanySchema = companyBaseSchema
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema });

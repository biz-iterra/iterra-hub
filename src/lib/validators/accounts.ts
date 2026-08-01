import { z } from "zod";
import { expectedUpdatedAtSchema, uuidString } from "./common";

export const createAccountSchema = z.object({
  name: z.string().min(1, "取引先名は必須です").max(200),
  company_id: uuidString().nullable().optional(),
  account_type_id: uuidString().nullable().optional(),
  account_status_id: uuidString("ステータスは必須です"),
  description: z.string().max(1000).nullable().optional(),
  lead_source_id: uuidString().nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
  // 適格請求書発行事業者の登録番号。取引の主体に紐づく情報なので取引先が持つ
  invoice_registration_number: z
    .string()
    .regex(/^T\d{13}$/, "登録番号は T + 13 桁で入力してください")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  invoice_registered: z.boolean().optional(),
});

export const updateAccountSchema = createAccountSchema
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema });

// account_contacts
export const createAccountContactSchema = z.object({
  account_id: uuidString(),
  contact_id: uuidString(),
  role: z.enum(["primary", "billing", "technical", "other"]).nullable().optional(),
});

// ---------------------------------------------------------------------------
// 取引先区分（account_roles）
//
// 顧客／仕入れ先などの取引上の役割。1 社が複数持ちうるため中間テーブルで扱う。
// 事業体の形態を表す account_type_id とは別軸。
// ---------------------------------------------------------------------------
export const createAccountRoleSchema = z.object({
  account_id: uuidString(),
  role_type_id: uuidString(),
});
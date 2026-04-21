import { z } from "zod";
import { uuidString, optionalUuidSchema } from "./common";

// ---------- leadCreateSchema ----------
export const leadCreateSchema = z.object({
  lead_name: z
    .string()
    .min(1, "[lead_name] リード名は必須です")
    .max(100, "[lead_name] リード名は100文字以内で入力してください"),

  account_type_id: uuidString("[account_type_id] アカウント種別は必須です"),

  stage_id: uuidString("[stage_id] ステージは必須です"),
  // Opportunity ステージは status が存在しないため NULL 許容
  status_id: uuidString("[status_id] ステータスを指定してください").nullable().optional(),
  // stage_id ↔ status_id の親子整合性は Server Action 側でチェック

  company_name: z
    .string()
    .max(100, "[company_name] 企業名は100文字以内で入力してください")
    .nullable()
    .optional(),

  lead_source_id: optionalUuidSchema,

  category_id: optionalUuidSchema,

  temperature_id: optionalUuidSchema,
  score: z
    .number()
    .int("[score] スコアは整数で入力してください")
    .min(0, "[score] スコアは0以上で入力してください")
    .max(100, "[score] スコアは100以下で入力してください")
    .nullable()
    .optional(),

  url: z
    .string()
    .url("[url] URL形式で入力してください")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),

  phone: z
    .string()
    .max(20, "[phone] 電話番号は20文字以内で入力してください")
    .nullable()
    .optional(),

  large_segment_id: optionalUuidSchema,
  small_segment_id: optionalUuidSchema,
  primary_caller_id: optionalUuidSchema,

  owner_user_id: uuidString("[owner_user_id] 担当者は必須です"),
  // promoted_deal_id は Server Action 内部で設定するため受け取らない
});

// ---------- leadUpdateSchema ----------
export const leadUpdateSchema = z.object({
  id: uuidString("[id] リードIDは必須です"),

  lead_name: z
    .string()
    .min(1, "[lead_name] リード名は必須です")
    .max(100, "[lead_name] リード名は100文字以内で入力してください")
    .optional(),

  account_type_id: uuidString("[account_type_id] アカウント種別を指定してください").optional(),

  stage_id: uuidString("[stage_id] ステージを指定してください").optional(),
  // Opportunity ステージは status が存在しないため NULL 許容
  status_id: uuidString("[status_id] ステータスを指定してください").nullable().optional(),

  company_name: z
    .string()
    .max(100, "[company_name] 企業名は100文字以内で入力してください")
    .nullable()
    .optional(),

  lead_source_id: optionalUuidSchema,

  category_id: optionalUuidSchema,

  temperature_id: optionalUuidSchema,
  score: z
    .number()
    .int("[score] スコアは整数で入力してください")
    .min(0, "[score] スコアは0以上で入力してください")
    .max(100, "[score] スコアは100以下で入力してください")
    .nullable()
    .optional(),

  url: z
    .string()
    .url("[url] URL形式で入力してください")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),

  phone: z
    .string()
    .max(20, "[phone] 電話番号は20文字以内で入力してください")
    .nullable()
    .optional(),

  large_segment_id: optionalUuidSchema,
  small_segment_id: optionalUuidSchema,
  primary_caller_id: optionalUuidSchema,

  owner_user_id: uuidString("[owner_user_id] 担当者を指定してください").optional(),

  deletion_reason: z.string().max(500).nullable().optional(),
});

// ---------- leadFiltersSchema ----------
export const leadFiltersSchema = z.object({
  stage_id: uuidString().optional(),
  status_id: uuidString().optional(),
  category_id: optionalUuidSchema,
  temperature_id: uuidString().optional(),
  owner_user_id: uuidString().optional(),
  keyword: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

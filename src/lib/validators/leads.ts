import { z } from "zod";
import { uuidString, optionalUuidSchema, emailSchema, phoneSchema, corporateNumberSchema, expectedUpdatedAtSchema } from "./common";

// ---------- leadCreateSchema ----------
export const leadCreateSchema = z.object({
  lead_name: z
    .string()
    .min(1, "[lead_name] リード名は必須です")
    .max(100, "[lead_name] リード名は100文字以内で入力してください"),

  account_type_id: uuidString("[account_type_id] 取引先種別は必須です"),

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

  // temperature_id はフォームからの手動入力を受け付けない。score も同様。
  // score / temperature_id は DB 関数 recalculate_lead_score で算出されるため手動設定不可。
  // Zod スキーマから削除することで UI から渡されても型エラーになる（Server Action 側でも除外）。

  url: z
    .string()
    .url("[url] URL形式で入力してください")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),

  company_phone: z
    .string()
    .max(20, "[company_phone] 代表電話は20文字以内で入力してください")
    .nullable()
    .optional(),

  // 企業属性（スコアリング Phase 3）
  // company_size_id は DB トリガで自動判定するため入力不可
  employee_count: z
    .number()
    .int("[employee_count] 従業員数は整数で入力してください")
    .nonnegative("[employee_count] 従業員数は0以上で入力してください")
    .nullable()
    .optional(),
  capital: z
    .number()
    .nonnegative("[capital] 資本金は0以上で入力してください")
    .nullable()
    .optional(),

  large_segment_id: optionalUuidSchema,
  small_segment_id: optionalUuidSchema,

  // 担当者情報（Phase 9b 追加カラム）
  contact_last_name: z.string().max(50, "[contact_last_name] 担当者姓は50文字以内で入力してください").nullable().optional(),
  contact_middle_name: z.string().max(50, "[contact_middle_name] 担当者ミドルネームは50文字以内で入力してください").nullable().optional(),
  contact_first_name: z.string().max(50, "[contact_first_name] 担当者名は50文字以内で入力してください").nullable().optional(),
  contact_last_name_kana: z.string().max(50, "[contact_last_name_kana] 担当者姓カナは50文字以内で入力してください").nullable().optional(),
  contact_middle_name_kana: z.string().max(50, "[contact_middle_name_kana] 担当者ミドルネームカナは50文字以内で入力してください").nullable().optional(),
  contact_first_name_kana: z.string().max(50, "[contact_first_name_kana] 担当者名カナは50文字以内で入力してください").nullable().optional(),
  contact_department: z.string().max(100, "[contact_department] 担当者部署は100文字以内で入力してください").nullable().optional(),
  contact_job_title: z.string().max(100, "[contact_job_title] 担当者役職は100文字以内で入力してください").nullable().optional(),
  contact_email: emailSchema,
  contact_phone: phoneSchema,

  // 企業情報（Phase 9b 追加カラム）
  company_name_kana: z.string().max(200, "[company_name_kana] 企業名カナは200文字以内で入力してください").nullable().optional(),
  representative_name: z.string().max(100, "[representative_name] 代表者名は100文字以内で入力してください").nullable().optional(),
  corporate_number: corporateNumberSchema,

  owner_user_id: uuidString("[owner_user_id] 担当者は必須です"),
  // 副担当ユーザーID 配列（lead_owners 中間テーブルに格納）。主担当との重複は Server Action 側で除外。
  sub_owner_user_ids: z.array(uuidString()).optional().default([]),
  // promoted_deal_id は Server Action 内部で設定するため受け取らない
  // company_size_id は DB トリガ（resolve_lead_company_size）で自動設定するため受け取らない
});

// ---------- leadUpdateSchema ----------
export const leadUpdateSchema = z.object({
  /** 楽観ロック: 編集開始時点の updated_at */
  expected_updated_at: expectedUpdatedAtSchema,
  id: uuidString("[id] リードIDは必須です"),

  lead_name: z
    .string()
    .min(1, "[lead_name] リード名は必須です")
    .max(100, "[lead_name] リード名は100文字以内で入力してください")
    .optional(),

  account_type_id: uuidString("[account_type_id] 取引先種別を指定してください").optional(),

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

  // score / temperature_id は DB 関数 recalculate_lead_score で算出されるため手動設定不可。
  // Zod スキーマから削除することで UI から渡されても型エラーになる（Server Action 側でも除外）。

  url: z
    .string()
    .url("[url] URL形式で入力してください")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),

  company_phone: z
    .string()
    .max(20, "[company_phone] 代表電話は20文字以内で入力してください")
    .nullable()
    .optional(),

  // 企業属性（スコアリング Phase 3）
  // company_size_id は DB トリガで自動判定するため入力不可
  employee_count: z
    .number()
    .int("[employee_count] 従業員数は整数で入力してください")
    .nonnegative("[employee_count] 従業員数は0以上で入力してください")
    .nullable()
    .optional(),
  capital: z
    .number()
    .nonnegative("[capital] 資本金は0以上で入力してください")
    .nullable()
    .optional(),

  large_segment_id: optionalUuidSchema,
  small_segment_id: optionalUuidSchema,

  // 担当者情報（Phase 9b 追加カラム）
  contact_last_name: z.string().max(50, "[contact_last_name] 担当者姓は50文字以内で入力してください").nullable().optional(),
  contact_middle_name: z.string().max(50, "[contact_middle_name] 担当者ミドルネームは50文字以内で入力してください").nullable().optional(),
  contact_first_name: z.string().max(50, "[contact_first_name] 担当者名は50文字以内で入力してください").nullable().optional(),
  contact_last_name_kana: z.string().max(50, "[contact_last_name_kana] 担当者姓カナは50文字以内で入力してください").nullable().optional(),
  contact_middle_name_kana: z.string().max(50, "[contact_middle_name_kana] 担当者ミドルネームカナは50文字以内で入力してください").nullable().optional(),
  contact_first_name_kana: z.string().max(50, "[contact_first_name_kana] 担当者名カナは50文字以内で入力してください").nullable().optional(),
  contact_department: z.string().max(100, "[contact_department] 担当者部署は100文字以内で入力してください").nullable().optional(),
  contact_job_title: z.string().max(100, "[contact_job_title] 担当者役職は100文字以内で入力してください").nullable().optional(),
  contact_email: emailSchema,
  contact_phone: phoneSchema,

  // 企業情報（Phase 9b 追加カラム）
  company_name_kana: z.string().max(200, "[company_name_kana] 企業名カナは200文字以内で入力してください").nullable().optional(),
  representative_name: z.string().max(100, "[representative_name] 代表者名は100文字以内で入力してください").nullable().optional(),
  corporate_number: corporateNumberSchema,

  owner_user_id: uuidString("[owner_user_id] 担当者を指定してください").optional(),
  // 副担当ユーザーID 配列（lead_owners 中間テーブルに格納）。主担当との重複は Server Action 側で除外。
  sub_owner_user_ids: z.array(uuidString()).optional(),

  deletion_reason: z.string().max(500).nullable().optional(),
  // company_size_id は DB トリガ（resolve_lead_company_size）で自動設定するため受け取らない
});

// ---------- leadCustomerActivityCreateSchema ----------
export const leadCustomerActivityCreateSchema = z.object({
  lead_id: uuidString("[lead_id] リードIDは必須です"),
  activity_type_id: uuidString("[activity_type_id] 行動タイプは必須です"),
  occurred_at: z
    .string()
    .datetime({ message: "[occurred_at] 日時形式で入力してください" })
    .optional(),
  detail: z
    .string()
    .max(2000, "[detail] 詳細は2000文字以内で入力してください")
    .nullable()
    .optional(),
  source: z
    .string()
    .max(200, "[source] ソースは200文字以内で入力してください")
    .nullable()
    .optional(),
});

// ---------- leadCustomerActivityUpdateSchema ----------
export const leadCustomerActivityUpdateSchema = leadCustomerActivityCreateSchema
  .partial()
  .extend({
    id: uuidString("[id] 顧客行動IDは必須です"),
    // 楽観ロック用。未指定の場合はロックなし（後方互換）で従来どおり動作する
    expected_updated_at: expectedUpdatedAtSchema,
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
  // 並び順は URL 由来。許可された列かどうかは resolveListSort が判定する
  sortField: z.string().max(64).optional(),
  sortDirection: z.enum(["asc", "desc"] as const).optional(),
});

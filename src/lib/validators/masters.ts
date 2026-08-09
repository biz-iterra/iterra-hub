import { z } from "zod";
import {
  badgeColorSchema,
  masterCodeSchema,
  masterDefinitionSchema,
  masterNameSchema,
  sortOrderSchema,
  uuidString,
} from "./common";

/**
 * マスタのバリデーション。
 *
 * 規約:
 * - DB が NOT NULL のカラムはここでも必須にする。抜けると Postgres の生エラー
 *   （null value in column ... violates not-null constraint）が画面に出る
 * - 文字数上限・形式は DB の CHECK 制約と同じ値に揃える
 * - メッセージは必ず `[field] 日本語` 形式。Zod 既定の英語文言を残さない
 *   （画面のトーストにそのまま出るため）
 */

// --- M01: pipeline_types ---
// クローズ予定日の既定月数（空文字は「自動設定しない」を意味する NULL に正規化する）
const defaultCloseMonthsSchema = z.preprocess(
  (v) => (v === "" ? null : v),
  z
    .number({ error: "[default_close_months] 数値で入力してください" })
    .int({ message: "[default_close_months] クローズ予定日の既定は整数（月）で入力してください" })
    .min(0, { message: "[default_close_months] クローズ予定日の既定は0以上120以下で入力してください" })
    .max(120, { message: "[default_close_months] クローズ予定日の既定は0以上120以下で入力してください" })
    .nullable()
    .optional()
);

export const createPipelineTypeSchema = z.object({
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
  sort_order: sortOrderSchema,
  default_close_months: defaultCloseMonthsSchema,
  // ディール化で使う既定のパイプライン。DB の部分 UNIQUE が 1 行だけに制限する
  is_default: z.boolean().optional(),
});
export const updatePipelineTypeSchema = createPipelineTypeSchema.partial();

// --- M02: contract_types ---
export const createContractTypeSchema = z.object({
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
});
export const updateContractTypeSchema = createContractTypeSchema.partial();

// --- M03: corporate_types ---
export const createCorporateTypeSchema = z.object({
  is_sole_proprietor: z.boolean().optional(),
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
});
export const updateCorporateTypeSchema = createCorporateTypeSchema.partial();

// --- M04: services ---
export const createServiceSchema = z.object({
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
});
export const updateServiceSchema = createServiceSchema.partial();

// --- M05: lead_sources ---
export const createLeadSourceSchema = z.object({
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
  // 問い合わせ取込で付ける流入元。DB の部分 UNIQUE が 1 行だけに制限する
  is_inquiry_default: z.boolean().optional(),
});
export const updateLeadSourceSchema = createLeadSourceSchema.partial();

// --- M06: account_types ---
export const createAccountTypeSchema = z.object({
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  // 法人向けの入力欄（法人番号・代表者など）を出すか
  requires_corporate_fields: z.boolean().optional(),
  // 企業名を入れたときに自動で選ぶ種別。DB の部分 UNIQUE が 1 行だけに制限する
  is_company_default: z.boolean().optional(),
});
export const updateAccountTypeSchema = createAccountTypeSchema.partial();

// --- M07: account_statuses ---
export const createAccountStatusSchema = z.object({
  is_active_default: z.boolean().optional(),
  is_churned_default: z.boolean().optional(),
  is_prospect_default: z.boolean().optional(),
  code: masterCodeSchema("code", "コード", "active"),
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  color: badgeColorSchema,
});
export const updateAccountStatusSchema = createAccountStatusSchema.partial();

// --- M08: contact_statuses ---
export const createContactStatusSchema = z.object({
  is_new_default: z.boolean().optional(),
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  color: badgeColorSchema,
});
export const updateContactStatusSchema = createContactStatusSchema.partial();

// --- M11: company_statuses ---
export const createCompanyStatusSchema = z.object({
  is_new_default: z.boolean().optional(),
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  color: badgeColorSchema,
});
export const updateCompanyStatusSchema = createCompanyStatusSchema.partial();

// --- M09: skill_categories ---
export const createSkillCategorySchema = z.object({
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  sort_order: sortOrderSchema,
});
export const updateSkillCategorySchema = createSkillCategorySchema.partial();

// --- M10: skills ---
export const createSkillSchema = z.object({
  skill_category_id: uuidString("[skill_category_id] スキルカテゴリを選択してください"),
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
  sort_order: sortOrderSchema,
});
export const updateSkillSchema = createSkillSchema.partial();

// --- M22: lead_categories ---
export const leadCategoryCreateSchema = z.object({
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  color: badgeColorSchema,
  sort_order: sortOrderSchema,
});
export const leadCategoryUpdateSchema = leadCategoryCreateSchema.partial();

// --- M23: lead_activity_types ---
export const leadActivityTypeCreateSchema = z.object({
  is_card_exchange: z.boolean().optional(),
  code: masterCodeSchema("code", "コード", "call"),
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  color: badgeColorSchema,
  sort_order: sortOrderSchema,
});
export const leadActivityTypeUpdateSchema = leadActivityTypeCreateSchema.partial();

// --- S01: deal_stages ---
export const createDealStageSchema = z.object({
  pipeline_type_id: uuidString("[pipeline_type_id] パイプラインを選択してください"),
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
  current_situation: z
    .string()
    .max(500, { message: "[current_situation] 現在の状況は500文字以内で入力してください" })
    .nullable()
    .optional(),
  required_action: z
    .string()
    .max(500, { message: "[required_action] 必要なアクションは500文字以内で入力してください" })
    .nullable()
    .optional(),
  customer_situation: z
    .string()
    .max(500, { message: "[customer_situation] 顧客の状況は500文字以内で入力してください" })
    .nullable()
    .optional(),
  transition_condition: z
    .string()
    .max(500, { message: "[transition_condition] 遷移条件は500文字以内で入力してください" })
    .nullable()
    .optional(),
  sort_order: sortOrderSchema,
  color: badgeColorSchema,
});
export const updateDealStageSchema = createDealStageSchema.partial();

// --- S02: deal_statuses ---
export const createDealStatusSchema = z.object({
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
  pipeline_type_id: uuidString("[pipeline_type_id] パイプラインを選択してください"),
  deal_stage_id: uuidString("[deal_stage_id] ディールステージの指定が不正です").nullable().optional(),
  sort_order: sortOrderSchema,
  color: badgeColorSchema,
});
export const updateDealStatusSchema = createDealStatusSchema.partial();

// --- lead_stages ---
export const leadStageCreateSchema = z.object({
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
  sort_order: sortOrderSchema,
  color: badgeColorSchema,
  // 問い合わせ取込で付ける初期ステージ。DB の部分 UNIQUE が 1 行だけに制限する
  is_inquiry_default: z.boolean().optional(),
});
export const leadStageUpdateSchema = leadStageCreateSchema.partial();

// --- lead_statuses ---
// stage_id / code は DB が NOT NULL。UNIQUE(stage_id, code) なので
// 同じステージ内でコードが重複すると DB 側で弾かれる
export const leadStatusCreateSchema = z.object({
  is_inquiry_initial: z.boolean().optional(),
  is_card_import_initial: z.boolean().optional(),
  stage_id: uuidString("[stage_id] リードステージを選択してください"),
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
  sort_order: sortOrderSchema,
  color: badgeColorSchema,
});
export const leadStatusUpdateSchema = leadStatusCreateSchema.partial();

// --- lead_temperatures ---
export const leadTemperatureCreateSchema = z.object({
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  sort_order: sortOrderSchema,
});
export const leadTemperatureUpdateSchema = leadTemperatureCreateSchema.partial();

// --- lead_call_statuses ---
export const leadCallStatusCreateSchema = z.object({
  is_card_exchange: z.boolean().optional(),
  code: masterCodeSchema("code", "コード", "connected"),
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  sort_order: sortOrderSchema,
});
export const leadCallStatusUpdateSchema = leadCallStatusCreateSchema.partial();

// --- lead_large_segments ---
export const leadLargeSegmentCreateSchema = z.object({
  code: masterCodeSchema("code", "コード", "manufacturing"),
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
});
export const leadLargeSegmentUpdateSchema = leadLargeSegmentCreateSchema.partial();

// --- lead_small_segments ---
export const leadSmallSegmentCreateSchema = z.object({
  large_segment_id: uuidString("[large_segment_id] 大セグメントを選択してください"),
  code: masterCodeSchema("code", "コード", "food_manufacturing"),
  name: masterNameSchema(100),
  definition: masterDefinitionSchema,
});
export const leadSmallSegmentUpdateSchema = leadSmallSegmentCreateSchema.partial();

// --- M24: lead_company_sizes ---
export const leadCompanySizeSchema = z.object({
  code: masterCodeSchema("code", "コード", "smb"),
  name: masterNameSchema(100),
  min_employees: z
    .number({ error: "[min_employees] 従業員数下限は数値で入力してください" })
    .int({ message: "[min_employees] 従業員数下限は整数で入力してください" })
    .min(0, { message: "[min_employees] 従業員数下限は0以上の整数を指定してください" })
    .nullable()
    .optional(),
  max_employees: z
    .number({ error: "[max_employees] 従業員数上限は数値で入力してください" })
    .int({ message: "[max_employees] 従業員数上限は整数で入力してください" })
    .min(0, { message: "[max_employees] 従業員数上限は0以上の整数を指定してください" })
    .nullable()
    .optional(),
  min_capital: z
    .number({ error: "[min_capital] 資本金下限は数値で入力してください" })
    .min(0, { message: "[min_capital] 資本金下限は0以上の数値を指定してください" })
    .nullable()
    .optional(),
  max_capital: z
    .number({ error: "[max_capital] 資本金上限は数値で入力してください" })
    .min(0, { message: "[max_capital] 資本金上限は0以上の数値を指定してください" })
    .nullable()
    .optional(),
  sort_order: sortOrderSchema,
}).refine(
  (d) =>
    d.min_employees == null ||
    d.max_employees == null ||
    d.min_employees <= d.max_employees,
  { message: "[min_employees] 従業員数下限は上限以下にしてください", path: ["min_employees"] }
).refine(
  (d) =>
    d.min_capital == null ||
    d.max_capital == null ||
    d.min_capital <= d.max_capital,
  { message: "[min_capital] 資本金下限は上限以下にしてください", path: ["min_capital"] }
);
// .partial() は refine を含むスキーマに使用不可。フィールドを明示的にオプション化する
export const leadCompanySizeUpdateSchema = z.object({
  code: masterCodeSchema("code", "コード", "smb").optional(),
  name: masterNameSchema(100).optional(),
  min_employees: z
    .number({ error: "[min_employees] 従業員数下限は数値で入力してください" })
    .int({ message: "[min_employees] 従業員数下限は整数で入力してください" })
    .min(0, { message: "[min_employees] 従業員数下限は0以上の整数を指定してください" })
    .nullable()
    .optional(),
  max_employees: z
    .number({ error: "[max_employees] 従業員数上限は数値で入力してください" })
    .int({ message: "[max_employees] 従業員数上限は整数で入力してください" })
    .min(0, { message: "[max_employees] 従業員数上限は0以上の整数を指定してください" })
    .nullable()
    .optional(),
  min_capital: z
    .number({ error: "[min_capital] 資本金下限は数値で入力してください" })
    .min(0, { message: "[min_capital] 資本金下限は0以上の数値を指定してください" })
    .nullable()
    .optional(),
  max_capital: z
    .number({ error: "[max_capital] 資本金上限は数値で入力してください" })
    .min(0, { message: "[max_capital] 資本金上限は0以上の数値を指定してください" })
    .nullable()
    .optional(),
  sort_order: sortOrderSchema.optional(),
});

// --- M25: lead_customer_activity_types ---
export const leadCustomerActivityTypeSchema = z.object({
  is_form_submit: z.boolean().optional(),
  code: masterCodeSchema("code", "コード", "site_visit"),
  name: masterNameSchema(100),
  description: z
    .string()
    .max(500, { message: "[description] 説明は500文字以内で入力してください" })
    .nullable()
    .optional(),
  sort_order: sortOrderSchema,
});
export const leadCustomerActivityTypeUpdateSchema = leadCustomerActivityTypeSchema.partial();

// --- M26: lead_score_rules ---
const leadScoreRuleCategoryValues = ["attribute", "interest", "stage", "status", "activity"] as const;
const leadScoreRuleConditionTypeValues = [
  "company_size",
  "large_segment",
  "small_segment",
  "lead_source",
  "stage",
  "status",
  "call_status",
  "activity_type",
  "customer_activity_type",
] as const;

export const leadScoreRuleSchema = z.object({
  category: z.enum(leadScoreRuleCategoryValues, {
    error: "[category] attribute/interest/stage/status/activity のいずれかを指定してください",
  }),
  condition_type: z.enum(leadScoreRuleConditionTypeValues, {
    error: "[condition_type] 受信値が許可されていません",
  }),
  condition_value_id: uuidString("[condition_value_id] 条件の指定が不正です").nullable().optional(),
  condition_value_text: z
    .string()
    .max(500, { message: "[condition_value_text] 500文字以内で入力してください" })
    .nullable()
    .optional(),
  score_delta: z
    .number({ error: "[score_delta] 加点値は数値で入力してください" })
    .int({ message: "[score_delta] 加点値は整数で入力してください" })
    .min(0, { message: "[score_delta] 加点値は0以上100以下の整数を指定してください" })
    .max(100, { message: "[score_delta] 加点値は0以上100以下の整数を指定してください" }),
  description: z
    .string()
    .max(300, { message: "[description] 説明は300文字以内で入力してください" })
    .nullable()
    .optional(),
  sort_order: sortOrderSchema,
});
export const leadScoreRuleUpdateSchema = leadScoreRuleSchema.partial();

// --- account_role_types（取引先区分）---
// 取引上の役割（顧客・仕入れ先など）。事業体の形態を表す account_types とは別軸。
// pipeline_type_id を持つ区分は、そのパイプラインで契約が成立したときに自動付与される。
export const createAccountRoleTypeSchema = z.object({
  code: masterCodeSchema("code", "コード", "customer"),
  name: masterNameSchema(50),
  definition: masterDefinitionSchema,
  color: badgeColorSchema,
  sort_order: sortOrderSchema,
  pipeline_type_id: uuidString("[pipeline_type_id] パイプラインの指定が不正です")
    .nullable()
    .optional(),
});
export const updateAccountRoleTypeSchema = createAccountRoleTypeSchema.partial();

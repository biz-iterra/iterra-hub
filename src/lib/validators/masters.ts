import { z } from "zod";
import { uuidString } from "./common";

// --- M01: pipeline_types ---
export const createPipelineTypeSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updatePipelineTypeSchema = createPipelineTypeSchema.partial();

// --- M02: contract_types ---
export const createContractTypeSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateContractTypeSchema = createContractTypeSchema.partial();

// --- M03: corporate_types ---
export const createCorporateTypeSchema = z.object({
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateCorporateTypeSchema = createCorporateTypeSchema.partial();

// --- M04: services ---
export const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateServiceSchema = createServiceSchema.partial();

// --- M05: lead_sources ---
export const createLeadSourceSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateLeadSourceSchema = createLeadSourceSchema.partial();

// --- M06: account_types ---
export const createAccountTypeSchema = z.object({
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateAccountTypeSchema = createAccountTypeSchema.partial();

// --- M07: account_statuses ---
export const createAccountStatusSchema = z.object({
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateAccountStatusSchema = createAccountStatusSchema.partial();

// --- M08: contact_statuses ---
export const createContactStatusSchema = z.object({
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateContactStatusSchema = createContactStatusSchema.partial();

// --- M11: company_statuses ---
export const createCompanyStatusSchema = z.object({
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
});
export const updateCompanyStatusSchema = createCompanyStatusSchema.partial();

// --- M09: skill_categories ---
export const createSkillCategorySchema = z.object({
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updateSkillCategorySchema = createSkillCategorySchema.partial();

// --- M10: skills ---
export const createSkillSchema = z.object({
  skill_category_id: uuidString(),
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updateSkillSchema = createSkillSchema.partial();

// --- M22: lead_categories ---
export const leadCategoryCreateSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[a-z][a-z0-9_]{0,31}$/, "codeは小文字英字始まり、英数字とアンダースコアのみ使用可"),
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "colorは #RRGGBB 形式で指定").nullable().optional(),
  sort_order: z.number().int().min(0, { message: "[sort_order] 表示順は 0 以上の整数を指定してください" }).default(0),
});
export const leadCategoryUpdateSchema = leadCategoryCreateSchema.partial();

// --- M23: lead_activity_types ---
export const leadActivityTypeCreateSchema = z.object({
  code: z.string().min(1).max(32).regex(/^[a-z][a-z0-9_]{0,31}$/, "codeは小文字英字始まり、英数字とアンダースコアのみ使用可"),
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "colorは #RRGGBB 形式で指定").nullable().optional(),
  sort_order: z.number().int().min(0, { message: "[sort_order] 表示順は 0 以上の整数を指定してください" }).default(0),
});
export const leadActivityTypeUpdateSchema = leadActivityTypeCreateSchema.partial();

// --- S01: deal_stages ---
export const createDealStageSchema = z.object({
  pipeline_type_id: uuidString(),
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  current_situation: z.string().max(500).nullable().optional(),
  required_action: z.string().max(500).nullable().optional(),
  customer_situation: z.string().max(500).nullable().optional(),
  transition_condition: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updateDealStageSchema = createDealStageSchema.partial();

// --- S02: deal_statuses ---
export const createDealStatusSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  pipeline_type_id: uuidString(),
  deal_stage_id: uuidString().nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updateDealStatusSchema = createDealStatusSchema.partial();

// --- lead_stages ---
export const leadStageCreateSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const leadStageUpdateSchema = leadStageCreateSchema.partial();

// --- lead_statuses ---
export const leadStatusCreateSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  stage_id: uuidString().nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const leadStatusUpdateSchema = leadStatusCreateSchema.partial();

// --- lead_temperatures ---
export const leadTemperatureCreateSchema = z.object({
  name: z.string().min(1).max(50),
  definition: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const leadTemperatureUpdateSchema = leadTemperatureCreateSchema.partial();

// --- lead_call_statuses ---
export const leadCallStatusCreateSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const leadCallStatusUpdateSchema = leadCallStatusCreateSchema.partial();

// --- lead_large_segments ---
export const leadLargeSegmentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
});
export const leadLargeSegmentUpdateSchema = leadLargeSegmentCreateSchema.partial();

// --- lead_small_segments ---
export const leadSmallSegmentCreateSchema = z.object({
  name: z.string().min(1).max(100),
  definition: z.string().max(1000).nullable().optional(),
  large_segment_id: uuidString().nullable().optional(),
});
export const leadSmallSegmentUpdateSchema = leadSmallSegmentCreateSchema.partial();

// --- M24: lead_company_sizes ---
export const leadCompanySizeSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9_]*$/, "[code] 小文字英字始まり、英数字とアンダースコアのみ使用可"),
  name: z
    .string()
    .min(1, { message: "[name] 名称は1文字以上で入力してください" })
    .max(100, { message: "[name] 名称は100文字以内で入力してください" }),
  min_employees: z
    .number()
    .int()
    .min(0, { message: "[min_employees] 従業員数下限は0以上の整数を指定してください" })
    .nullable()
    .optional(),
  max_employees: z
    .number()
    .int()
    .min(0, { message: "[max_employees] 従業員数上限は0以上の整数を指定してください" })
    .nullable()
    .optional(),
  min_capital: z
    .number()
    .min(0, { message: "[min_capital] 資本金下限は0以上の数値を指定してください" })
    .nullable()
    .optional(),
  max_capital: z
    .number()
    .min(0, { message: "[max_capital] 資本金上限は0以上の数値を指定してください" })
    .nullable()
    .optional(),
  sort_order: z
    .number()
    .int()
    .min(0, { message: "[sort_order] 表示順は0以上の整数を指定してください" })
    .default(0),
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
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9_]*$/, "[code] 小文字英字始まり、英数字とアンダースコアのみ使用可")
    .optional(),
  name: z
    .string()
    .min(1, { message: "[name] 名称は1文字以上で入力してください" })
    .max(100, { message: "[name] 名称は100文字以内で入力してください" })
    .optional(),
  min_employees: z.number().int().min(0).nullable().optional(),
  max_employees: z.number().int().min(0).nullable().optional(),
  min_capital: z.number().min(0).nullable().optional(),
  max_capital: z.number().min(0).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

// --- M25: lead_customer_activity_types ---
export const leadCustomerActivityTypeSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9_]*$/, "[code] 小文字英字始まり、英数字とアンダースコアのみ使用可"),
  name: z
    .string()
    .min(1, { message: "[name] 名称は1文字以上で入力してください" })
    .max(100, { message: "[name] 名称は100文字以内で入力してください" }),
  description: z
    .string()
    .max(500, { message: "[description] 説明は500文字以内で入力してください" })
    .nullable()
    .optional(),
  sort_order: z
    .number()
    .int()
    .min(0, { message: "[sort_order] 表示順は0以上の整数を指定してください" })
    .default(0),
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
  condition_value_id: uuidString().nullable().optional(),
  condition_value_text: z
    .string()
    .max(500, { message: "[condition_value_text] 500文字以内で入力してください" })
    .nullable()
    .optional(),
  score_delta: z
    .number()
    .int()
    .min(0, { message: "[score_delta] 加点値は0以上100以下の整数を指定してください" })
    .max(100, { message: "[score_delta] 加点値は0以上100以下の整数を指定してください" }),
  description: z
    .string()
    .max(300, { message: "[description] 説明は300文字以内で入力してください" })
    .nullable()
    .optional(),
  sort_order: z
    .number()
    .int()
    .min(0, { message: "[sort_order] 表示順は0以上の整数を指定してください" })
    .default(0),
});
export const leadScoreRuleUpdateSchema = leadScoreRuleSchema.partial();

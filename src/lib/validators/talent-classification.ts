import { z } from "zod";
import { uuidString } from "./common";

// ============================================================
// 系統マスタ（閲覧のみ）
// ============================================================
export const talentSystemTagSchema = z.object({
  id: uuidString(),
  system_code: z.string().max(8),
  name: z.string(),
  definition: z.string().nullable(),
  determination_rule: z.record(z.string(), z.unknown()),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TalentSystemTag = z.infer<typeof talentSystemTagSchema>;

// ============================================================
// グレードマスタ（閲覧のみ）
// ============================================================
export const talentGradeSchema = z.object({
  id: uuidString(),
  grade_code: z.string().max(8),
  band: z.string().max(8),
  sort_order: z.number().int(),
  years_min: z.number().nullable(),
  years_max: z.number().nullable(),
  expected_role: z.string().nullable(),
  evaluation_points: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TalentGrade = z.infer<typeof talentGradeSchema>;

// ============================================================
// 昇格要件マスタ（閲覧のみ）
// skill_thresholds の各要素は axis_filter / skill_ids_any_pool / min_star / min_count を持つ
// ============================================================

/** 個別閾値の型（Phase 2c 判定ロジックで使用） */
export const skillThresholdSchema = z.object({
  axis_filter: z.enum(["T", "D", "B", "M"]).optional(),
  /** "d_co_system_skill_ids" のような pool 名を参照する場合 */
  skill_ids_any_pool: z.string().optional(),
  /** 特定スキル skill_code のリスト（直接指定の場合） */
  skill_ids_any: z.array(z.string()).optional(),
  min_star: z.number().int().min(0).max(5),
  min_count: z.number().int().min(1),
});
export type SkillThreshold = z.infer<typeof skillThresholdSchema>;

export const talentGradeRequirementSchema = z.object({
  id: uuidString(),
  system_code: z.string().max(8),
  grade_code: z.string().max(8),
  skill_thresholds: z.array(skillThresholdSchema),
  required_achievements: z.array(z.string()),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TalentGradeRequirement = z.infer<typeof talentGradeRequirementSchema>;

// ============================================================
// 職種マスタ（閲覧のみ）
// ============================================================

/** 職種判定ルールの1要素（Phase 2c 判定ロジックで使用） */
export const jobTypeRuleSchema = z.object({
  /** T/D/B/M で軸全体を集計する場合 */
  axis_filter: z.enum(["T", "D", "B", "M"]).optional(),
  /** OR結合: リスト内の任意1スキルが min_star 以上 */
  skill_ids_any: z.array(z.string()).optional(),
  min_star: z.number().int().min(0).max(5),
  /** axis_filter 使用時のみ必要 */
  min_count: z.number().int().min(1).optional(),
});
export type JobTypeRule = z.infer<typeof jobTypeRuleSchema>;

export const talentJobTypeSchema = z.object({
  id: uuidString(),
  job_type_code: z.string().max(32),
  name: z.string(),
  category: z.string().nullable(),
  rules: z.array(jobTypeRuleSchema),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TalentJobType = z.infer<typeof talentJobTypeSchema>;

// ============================================================
// 実績マスタ（閲覧のみ）
// ============================================================
export const talentAchievementMasterSchema = z.object({
  id: uuidString(),
  achievement_code: z.string().max(32),
  name: z.string(),
  criteria: z.string().nullable(),
  quantitative_threshold: z.record(z.string(), z.unknown()).nullable(),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TalentAchievementMaster = z.infer<typeof talentAchievementMasterSchema>;

// ============================================================
// タレント×実績 CRUD
// ============================================================
/** talent_achievements の1行 */
export const talentAchievementSchema = z.object({
  id: uuidString(),
  talent_id: uuidString(),
  achievement_code: z.string().max(32),
  achieved_at: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type TalentAchievement = z.infer<typeof talentAchievementSchema>;

/** 実績マスタを JOIN した取得結果（getTalentAchievements / addTalentAchievement の戻り値） */
export type TalentAchievementWithMaster = TalentAchievement & {
  master: Pick<
    TalentAchievementMaster,
    "achievement_code" | "name" | "criteria"
  > & { quantitative_threshold?: TalentAchievementMaster["quantitative_threshold"] } | null;
};

export const createTalentAchievementSchema = z.object({
  talent_id: uuidString("タレントIDは必須です"),
  achievement_code: z.string().min(1, "実績コードは必須です").max(32),
  achieved_at: z.string().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const updateTalentAchievementSchema = createTalentAchievementSchema
  .omit({ talent_id: true, achievement_code: true })
  .partial();

export type CreateTalentAchievementInput = z.infer<typeof createTalentAchievementSchema>;
export type UpdateTalentAchievementInput = z.infer<typeof updateTalentAchievementSchema>;

// ============================================================
// skills 拡張フィールド型（getSkills のレスポンス用）
// ============================================================
export type SkillAxis = "T" | "D" | "B" | "M";

export const skillExtendedSchema = z.object({
  id: uuidString(),
  skill_code: z.string().max(8).nullable(),
  skill_category_id: uuidString(),
  axis: z.enum(["T", "D", "B", "M"]).nullable(),
  name: z.string(),
  system_tags: z.array(z.string()),
  note: z.string().nullable(),
  sort_order: z.number().int(),
  is_active: z.boolean(),
});
export type SkillExtended = z.infer<typeof skillExtendedSchema>;

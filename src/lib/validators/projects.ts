import { z } from "zod";
import { expectedUpdatedAtSchema, uuidString } from "./common";

const projectBaseSchema = z.object({
  name: z.string().min(1, "プロジェクト名は必須です").max(200),
  description: z.string().max(1000).nullable().optional(),
  project_status_id: uuidString("プロジェクトステータスは必須です"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式").nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 形式").nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
  internal_memo: z.string().max(2000).nullable().optional(),
});

const projectDateRangeRefinement = (data: {
  start_date?: string | null;
  end_date?: string | null;
}) => !data.start_date || !data.end_date || data.end_date >= data.start_date;

export const createProjectSchema = projectBaseSchema.refine(projectDateRangeRefinement, {
  message: "終了予定日は開始日以降にしてください",
  path: ["end_date"],
});

export const updateProjectSchema = projectBaseSchema
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema })
  .refine(projectDateRangeRefinement, {
    message: "終了予定日は開始日以降にしてください",
    path: ["end_date"],
  });

// プロジェクトメンバー
export const createProjectMemberSchema = z.object({
  project_id: uuidString(),
  user_id: uuidString(),
});

// ディール × プロジェクト
export const createDealProjectSchema = z.object({
  deal_id: uuidString(),
  project_id: uuidString(),
});

// プロジェクトステータス マスタ
export const createProjectStatusSchema = z.object({
  name: z.string().min(1, "ステータス名は必須です").max(50),
  definition: z.string().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});

export const updateProjectStatusSchema = createProjectStatusSchema.partial();

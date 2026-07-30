import { z } from "zod";
import { expectedUpdatedAtSchema, uuidString } from "./common";

export const createDealSchema = z.object({
  name: z.string().min(1, "取引名は必須です").max(200),
  pipeline_type_id: uuidString("パイプラインは必須です"),
  deal_stage_id: uuidString("ステージは必須です"),
  deal_status_id: uuidString("ステータスは必須です"),
  amount: z.number().int().min(0).nullable().optional(),
  account_id: uuidString("取引先は必須です"),
  owner_user_id: uuidString().nullable().optional(),
  contract_name: z.string().max(200).nullable().optional(),
  application_date: z.string().nullable().optional(),
  review_completed_date: z.string().nullable().optional(),
  expected_close_date: z.string().nullable().optional(),
}).refine(
  (data) => {
    if (data.application_date && data.review_completed_date) {
      return data.review_completed_date >= data.application_date;
    }
    return true;
  },
  { message: "審査完了日は申請日以降にしてください", path: ["review_completed_date"] }
);

export const updateDealSchema = z.object({
  /** 楽観ロック: 編集開始時点の updated_at */
  expected_updated_at: expectedUpdatedAtSchema,
  name: z.string().min(1).max(200).optional(),
  pipeline_type_id: uuidString().optional(),
  deal_stage_id: uuidString().optional(),
  deal_status_id: uuidString().optional(),
  amount: z.number().int().min(0).nullable().optional(),
  account_id: uuidString().optional(),
  owner_user_id: uuidString().nullable().optional(),
  contract_name: z.string().max(200).nullable().optional(),
  application_date: z.string().nullable().optional(),
  review_completed_date: z.string().nullable().optional(),
  expected_close_date: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
});

// deal_services
export const createDealServiceSchema = z.object({
  deal_id: uuidString(),
  service_id: uuidString(),
});

// カンバン D&D によるステージ/ステータス移動
export const moveDealCardSchema = z.object({
  dealId: uuidString("[dealId] UUID 形式で指定してください"),
  groupBy: z.enum(["stage", "status"]),
  targetId: uuidString("[targetId] UUID 形式で指定してください"),
  expectedUpdatedAt: z
    .string()
    .min(1, "[expectedUpdatedAt] 楽観ロックのため必須です"),
});

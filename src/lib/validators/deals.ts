import { z } from "zod";

export const createDealSchema = z.object({
  name: z.string().min(1, "取引名は必須です").max(200),
  pipeline_type_id: z.string().uuid("パイプラインは必須です"),
  deal_stage_id: z.string().uuid("ステージは必須です"),
  deal_status_id: z.string().uuid("ステータスは必須です"),
  amount: z.number().int().min(0).nullable().optional(),
  account_id: z.string().uuid("アカウントは必須です"),
  owner_user_id: z.string().uuid().nullable().optional(),
  contract_name: z.string().max(200).nullable().optional(),
  application_date: z.string().nullable().optional(),
  review_completed_date: z.string().nullable().optional(),
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
  name: z.string().min(1).max(200).optional(),
  pipeline_type_id: z.string().uuid().optional(),
  deal_stage_id: z.string().uuid().optional(),
  deal_status_id: z.string().uuid().optional(),
  amount: z.number().int().min(0).nullable().optional(),
  account_id: z.string().uuid().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
  contract_name: z.string().max(200).nullable().optional(),
  application_date: z.string().nullable().optional(),
  review_completed_date: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
});

// deal_services
export const createDealServiceSchema = z.object({
  deal_id: z.string().uuid(),
  service_id: z.string().uuid(),
});

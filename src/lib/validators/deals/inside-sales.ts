import { z } from "zod";
import { uuidString } from "../common";

// ============================================================
// インサイドセールス拡張（deal_ext_inside_sales）
// ============================================================

export const insideSalesExtensionSchema = z.object({
  large_segment_id: uuidString().nullable().optional(),
  small_segment_id: uuidString().nullable().optional(),
  prospect_company_name: z
    .string()
    .min(1)
    .max(200)
    .nullable()
    .optional(),
  url: z.string().max(500).url("URL形式で入力してください").nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  primary_caller_id: uuidString().nullable().optional(),
});

export type InsideSalesExtensionInput = z.infer<typeof insideSalesExtensionSchema>;

// ============================================================
// リード作成（Account＋Deal＋拡張を同時作成）
// prospect_company_name NULL → 個人Account / NOT NULL → 法人Account＋Company自動作成
// ============================================================

export const createInsideSalesLeadSchema = z.object({
  // Deal 本体
  name: z.string().min(1, "取引名は必須です").max(200),
  pipeline_type_id: uuidString("パイプラインは必須です"),
  deal_stage_id: uuidString("ステージは必須です"),
  deal_status_id: uuidString("ステータスは必須です"),
  owner_user_id: uuidString().nullable().optional(),
  amount: z.number().int().min(0).nullable().optional(),
  // Account 指定（既存アカウントを使う場合）
  account_id: uuidString().nullable().optional(),
  // 拡張カラム（Account新規作成時はこの情報から派生）
  extension: insideSalesExtensionSchema,
});

export type CreateInsideSalesLeadInput = z.infer<typeof createInsideSalesLeadSchema>;

// ============================================================
// 架電記録（deal_ext_inside_sales_calls）
// call_number はアプリ層で「既存max+1」採番のため入力対象外
// ============================================================

export const createInsideSalesCallSchema = z.object({
  deal_id: uuidString("ディールIDは必須です"),
  called_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "架電日は YYYY-MM-DD 形式で入力してください"),
  called_at_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "架電時間は HH:MM 形式で入力してください")
    .nullable()
    .optional(),
  call_status_id: uuidString("架電ステータスは必須です"),
  caller_id: uuidString("架電担当者は必須です"),
  note: z.string().max(1000).nullable().optional(),
});

export type CreateInsideSalesCallInput = z.infer<typeof createInsideSalesCallSchema>;

export const updateInsideSalesCallSchema = createInsideSalesCallSchema
  .omit({ deal_id: true })
  .partial();

export type UpdateInsideSalesCallInput = z.infer<typeof updateInsideSalesCallSchema>;

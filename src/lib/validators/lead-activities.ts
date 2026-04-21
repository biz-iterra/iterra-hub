import { z } from "zod";
import { uuidString } from "./common";

// ---------- leadActivityCreateSchema ----------
// call_number は Server Action 側で自動採番するため受け取らない
export const leadActivityCreateSchema = z.object({
  lead_id: uuidString("[lead_id] リードIDは必須です"),

  called_on: z
    .string()
    .min(1, "[called_on] 架電日は必須です")
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "[called_on] 架電日は YYYY-MM-DD 形式で入力してください"
    ),

  called_at_time: z
    .string()
    .regex(
      /^\d{2}:\d{2}(:\d{2})?$/,
      "[called_at_time] 架電時刻は HH:MM または HH:MM:SS 形式で入力してください"
    )
    .nullable()
    .optional(),

  call_status_id: uuidString("[call_status_id] 架電ステータスは必須です"),
  caller_id: uuidString("[caller_id] 架電者は必須です"),

  // activity_type_id: 任意（lead_activity_types マスタ参照）
  activity_type_id: uuidString("[activity_type_id] 対応種別IDが不正です")
    .nullable()
    .optional(),

  note: z
    .string()
    .max(1000, "[note] メモは1000文字以内で入力してください")
    .nullable()
    .optional(),
});

// ---------- leadActivityUpdateSchema ----------
// lead_activities は履歴テーブルにつき INSERT ONLY 運用（CLAUDE.md §アクセス制御ルール）。
// このスキーマは定義だけ提供し、Server Action 側では update エンドポイントを公開しない。
export const leadActivityUpdateSchema = z.object({
  id: uuidString("[id] 架電記録IDは必須です"),

  called_on: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "[called_on] 架電日は YYYY-MM-DD 形式で入力してください"
    )
    .optional(),

  called_at_time: z
    .string()
    .regex(
      /^\d{2}:\d{2}(:\d{2})?$/,
      "[called_at_time] 架電時刻は HH:MM または HH:MM:SS 形式で入力してください"
    )
    .nullable()
    .optional(),

  call_status_id: uuidString("[call_status_id] 架電ステータスを指定してください").optional(),
  caller_id: uuidString("[caller_id] 架電者を指定してください").optional(),

  // activity_type_id: 任意（lead_activity_types マスタ参照）
  activity_type_id: uuidString("[activity_type_id] 対応種別IDが不正です")
    .nullable()
    .optional(),

  note: z
    .string()
    .max(1000, "[note] メモは1000文字以内で入力してください")
    .nullable()
    .optional(),
});

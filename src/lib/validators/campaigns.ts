import { z } from "zod";
import { uuidString } from "@/lib/validators/common";

// ---------- campaignCreateSchema ----------
export const campaignCreateSchema = z
  .object({
    name: z
      .string()
      .min(1, "[name] キャンペーン名は必須です")
      .max(100, "[name] キャンペーン名は100文字以内で入力してください"),

    type: z.enum(["generation", "nurturing", "qualification"] as const, {
      error: "[type] キャンペーン種別は generation / nurturing / qualification のいずれかを指定してください",
    }),

    description: z
      .string()
      .max(1000, "[description] 説明は1000文字以内で入力してください")
      .nullable()
      .optional(),

    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),

    status: z
      .enum(["draft", "active", "paused", "completed", "cancelled"] as const, {
        error: "[status] ステータスは draft / active / paused / completed / cancelled のいずれかを指定してください",
      })
      .default("draft"),
    // シナリオ関連フィールドは追加しない（将来 Phase D で対応）
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return data.end_date >= data.start_date;
      }
      return true;
    },
    {
      message: "[end_date] 終了日は開始日以降にしてください",
      path: ["end_date"],
    }
  );

// ---------- campaignUpdateSchema ----------
export const campaignUpdateSchema = z
  .object({
    id: uuidString("[id] キャンペーンIDは必須です"),

    name: z
      .string()
      .min(1, "[name] キャンペーン名は必須です")
      .max(100, "[name] キャンペーン名は100文字以内で入力してください")
      .optional(),

    type: z
      .enum(["generation", "nurturing", "qualification"] as const, {
        error: "[type] キャンペーン種別は generation / nurturing / qualification のいずれかを指定してください",
      })
      .optional(),

    description: z
      .string()
      .max(1000, "[description] 説明は1000文字以内で入力してください")
      .nullable()
      .optional(),

    start_date: z.string().nullable().optional(),
    end_date: z.string().nullable().optional(),

    status: z
      .enum(["draft", "active", "paused", "completed", "cancelled"] as const, {
        error: "[status] ステータスは draft / active / paused / completed / cancelled のいずれかを指定してください",
      })
      .optional(),

    deletion_reason: z.string().max(500).nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return data.end_date >= data.start_date;
      }
      return true;
    },
    {
      message: "[end_date] 終了日は開始日以降にしてください",
      path: ["end_date"],
    }
  );

// ---------- attachLeadsToCampaignSchema ----------
export const attachLeadsToCampaignSchema = z.object({
  campaignId: uuidString("[campaignId] キャンペーンIDは必須です"),
  leadIds: z
    .array(uuidString("[leadIds] リードIDは有効なUUIDで指定してください"))
    .min(1, "[leadIds] 1件以上のリードを指定してください"),
});

// ---------- campaignFiltersSchema ----------
export const campaignFiltersSchema = z.object({
  type: z.enum(["generation", "nurturing", "qualification"] as const).optional(),
  status: z
    .enum(["draft", "active", "paused", "completed", "cancelled"] as const)
    .optional(),
  keyword: z.string().max(100).optional(),
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

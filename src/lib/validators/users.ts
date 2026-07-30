import { z } from "zod";
import { expectedUpdatedAtSchema } from "./common";

// --- 自分自身のプロフィール更新 ---
// role / email は自分では変更不可（Server Action 側で更新対象から除外する）
export const updateOwnProfileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "表示名を入力してください")
    .max(100, "表示名は100文字以内で入力してください"),
  expected_updated_at: expectedUpdatedAtSchema,
});

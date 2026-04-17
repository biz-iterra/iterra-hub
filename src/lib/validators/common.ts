import { z } from "zod";

// UUID
export const uuidSchema = z.string().uuid();

// 任意UUID（nullable フォームフィールド用）
export const optionalUuidSchema = z.string().uuid().nullable().optional();

// ページネーション
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  perPage: z.number().int().min(1).max(100).default(20),
});

// ソート
export const sortSchema = z.object({
  field: z.string(),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

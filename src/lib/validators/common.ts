import { z } from "zod";

// PostgreSQL UUID 型は RFC 4122 のバージョンビットを検査せず、8-4-4-4-12 の hex 形式なら受け入れる。
// 一方 Zod 標準の .uuid() は version/variant ビットまで検査するため、開発用 seed（c0000000-0000-...）が弾かれる。
// 両者を橋渡しするため、Postgres と同じ寛容な形式でチェックする。
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const uuidString = (message?: string) =>
  z.string().regex(UUID_REGEX, message ?? "UUID 形式で指定してください");

// UUID
export const uuidSchema = uuidString();

// 任意UUID（nullable フォームフィールド用）
export const optionalUuidSchema = uuidString().nullable().optional();

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

// ---------- 共通フィールドスキーマ ----------

// メールスキーマ（空文字は null に変換、undefined 許容）
export const emailSchema = z
  .string()
  .email("[email] メール形式で入力してください")
  .max(255, "[email] メールアドレスは255文字以内で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

// 電話番号スキーマ（最大 20 文字）
export const phoneSchema = z
  .string()
  .max(20, "[phone] 電話番号は20文字以内で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

// 法人番号スキーマ（13桁数字のみ）
export const corporateNumberSchema = z
  .string()
  .regex(/^\d{13}$/, "[corporate_number] 法人番号は13桁の数字で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

// URL スキーマ
export const urlSchema = z
  .string()
  .max(500, "[url] URLは500文字以内で入力してください")
  .url("[url] URL 形式で入力してください")
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

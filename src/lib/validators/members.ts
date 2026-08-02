import { z } from "zod";

/**
 * 社内メンバー。
 *
 * 追加は Supabase Auth のユーザー作成と `crm_users` の登録が対になる。
 * パスワードはここでは扱わない（Cloudflare Access 経由で入る運用。
 * 個別に要る場合は本人がパスワード再設定を行う）。
 */

export const CRM_ROLES = ["member", "manager", "admin"] as const;

export const createMemberSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスは必須です")
    .email("メールアドレスの形式が正しくありません")
    .max(255)
    // 保存前に揃える。大文字small違いで二重登録されるのを防ぐ
    .transform((v) => v.trim().toLowerCase()),
  full_name: z.string().min(1, "氏名は必須です").max(100),
  full_name_kana: z
    .string()
    .max(100)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  role: z.enum(CRM_ROLES),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/**
 * メンバーの修正。
 *
 * **メールアドレスは変えられない。** CRM の利用者と Supabase Auth のユーザー、
 * さらに Cloudflare Access の認証がすべて同じアドレスで結び付いており、
 * 片側だけ変えると本人がログインできなくなる。宛先が変わったときは
 * 新しいアドレスで追加し、古い方を停止する。
 */
export const updateMemberSchema = createMemberSchema.omit({ email: true });

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

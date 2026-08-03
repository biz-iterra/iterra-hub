"use server";

import { toUserMessage } from "@/lib/db-error";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import { updateOwnProfileSchema } from "@/lib/validators/users";

type ActionResult<T> = { data: T | null; error: string | null };

export async function getCurrentUser(): Promise<
  ActionResult<{ id: string; email: string; full_name: string; role: string; updated_at: string }>
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("crm_users")
    .select("id, email, full_name, role, updated_at")
    .eq("id", user.id)
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "ユーザー" }) };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 自分自身のプロフィール更新（表示名のみ。email / role は対象外）
// ---------------------------------------------------------------------------
export async function updateOwnProfile(
  input: unknown
): Promise<ActionResult<{ id: string; full_name: string; updated_at: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const parsed = updateOwnProfileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "input";
    return { data: null, error: `[${field}] ${issue.message}` };
  }

  const { full_name, expected_updated_at } = parsed.data;

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let query = supabase.from("crm_users").update({ full_name }).eq("id", user.id);
  if (expected_updated_at) {
    query = query.eq("updated_at", expected_updated_at);
  }

  const { data, error } = await query.select("id, full_name, updated_at").maybeSingle();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "ユーザー" }) };
  if (!data) return { data: null, error: conflictErrorMessage("プロフィール") };

  revalidatePath("/profile");
  return { data, error: null };
}

export async function getCrmUsers(): Promise<ActionResult<{ id: string; full_name: string; role: string }[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("crm_users")
    .select("id, full_name, role")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "ユーザー" }) };
  return { data: data ?? [], error: null };
}

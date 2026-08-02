"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  createContactSocialAccountSchema,
  updateContactSocialAccountSchema,
} from "@/lib/validators/contact-social-accounts";
import type { Row } from "@/types/relations";

/**
 * 連絡先の SNS・チャットの連絡口。
 *
 * 1 人が複数持てる（Chatwork と Slack の両方、Slack が 2 ワークスペース、など）。
 * メールや電話と同じく、本体の保存とは切り離してその場で増減させる。
 *
 * 権限は RLS が親（連絡先）の担当者を見て決める。ここでは認証だけ確かめ、
 * 拒否は RLS の 0 行更新として返ってくる。
 */

type ActionResult<T> = { data: T | null; error: string | null };

export type SocialService = Pick<
  Row<"social_services">,
  | "id"
  | "code"
  | "name"
  | "short_label"
  | "color"
  | "dm_url_template"
  | "requires_workspace"
  | "workspace_label"
  | "account_label"
  | "hint"
  | "sort_order"
>;

export type ContactSocialAccount = Pick<
  Row<"contact_social_accounts">,
  "id" | "contact_id" | "service_id" | "account_id" | "workspace" | "display_name" | "note"
> & { service: SocialService | null };

const SERVICE_COLUMNS =
  "id, code, name, short_label, color, dm_url_template, requires_workspace, workspace_label, account_label, hint, sort_order";

/** 画面に並べるサービスの一覧。使っていないものも「未設定」として出す */
export async function getSocialServices(): Promise<ActionResult<SocialService[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("social_services")
    .select(SERVICE_COLUMNS)
    .eq("is_active", true)
    .order("sort_order");

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function getContactSocialAccounts(
  contactId: string
): Promise<ActionResult<ContactSocialAccount[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_social_accounts")
    .select(
      `id, contact_id, service_id, account_id, workspace, display_name, note, service:social_services(${SERVICE_COLUMNS})`
    )
    .eq("contact_id", contactId)
    .order("created_at");

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as ContactSocialAccount[], error: null };
}

export async function createContactSocialAccount(
  input: Record<string, unknown>
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const parsed = createContactSocialAccountSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const { data, error } = await supabase
    .from("contact_social_accounts")
    .insert({ ...parsed.data, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    // 一意制約。同じ相手を二重に登録しようとしたとき
    if (error.code === "23505") {
      return { data: null, error: "同じ ID が既に登録されています" };
    }
    return { data: null, error: error.message };
  }

  revalidatePath(`/contacts/${parsed.data.contact_id}`);
  revalidatePath(`/contacts/${parsed.data.contact_id}/edit`);
  return { data, error: null };
}

export async function updateContactSocialAccount(
  id: string,
  input: Record<string, unknown>
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const parsed = updateContactSocialAccountSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const { data, error } = await supabase
    .from("contact_social_accounts")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("id", id)
    .select("contact_id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { data: null, error: "同じ ID が既に登録されています" };
    }
    return { data: null, error: error.message };
  }
  // RLS で弾かれると 0 行になる。エラーにならないので自分で気づく
  if (!data) return { data: null, error: "この連絡先を編集する権限がありません" };

  revalidatePath(`/contacts/${data.contact_id}`);
  revalidatePath(`/contacts/${data.contact_id}/edit`);
  return { data: null, error: null };
}

/**
 * 物理削除。
 *
 * 連絡口は「今つながれるか」を表すだけで、過去のやり取りの記録ではない
 * （やり取りはアクティビティが持つ）。消えた口を残す意味が無いので
 * 論理削除にしない。
 */
export async function deleteContactSocialAccount(
  id: string
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_social_accounts")
    .delete()
    .eq("id", id)
    .select("contact_id")
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: "この連絡先を編集する権限がありません" };

  revalidatePath(`/contacts/${data.contact_id}`);
  revalidatePath(`/contacts/${data.contact_id}/edit`);
  return { data: null, error: null };
}

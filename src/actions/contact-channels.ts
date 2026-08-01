"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * 連絡先のメール・電話。
 *
 * 1 人に複数の連絡手段が紐づくのは通常の状態で、増減も日常的に起きる。
 * そのたびに連絡先を作り直さずに済むよう、行単位で足し引きできるようにする。
 *
 * **名刺（business_cards）はこれらの行を指している。** 削除すると名刺から
 * 連絡手段の紐付けが外れる（FK は ON DELETE SET NULL）ため、消す前に件数を返す。
 */

type ActionResult<T> = { data: T | null; error: string | null };

const EMAIL_LABELS = ["work", "personal", "other"] as const;
const PHONE_LABELS = ["work", "mobile", "home", "fax", "other"] as const;

type Channel = "email" | "phone";

async function authorize(
  contactId: string
): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id, owner_user_id")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!contact) return { error: "連絡先が見つかりません" };

  // RLS でも守られるが、規約どおり Server Action 側でも確かめる
  const isManager = crmUser?.role === "manager" || crmUser?.role === "admin";
  if (!isManager && contact.owner_user_id !== user.id) {
    return { error: "この連絡先を変更する権限がありません" };
  }

  return { supabase, userId: user.id };
}

function refresh(contactId: string) {
  revalidatePath(`/contacts/${contactId}`);
  revalidatePath(`/contacts/${contactId}/edit`);
  revalidatePath("/contacts");
}

// ---------------------------------------------------------------------------
// 追加
// ---------------------------------------------------------------------------
export async function addContactChannel(
  contactId: string,
  channel: Channel,
  value: string,
  label: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await authorize(contactId);
  if ("error" in auth) return { data: null, error: auth.error };

  const trimmed = value.trim();
  if (!trimmed) {
    return { data: null, error: channel === "email" ? "メールアドレスを入力してください" : "電話番号を入力してください" };
  }
  if (channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { data: null, error: "メールアドレスの形式が正しくありません" };
  }

  const allowed = channel === "email" ? EMAIL_LABELS : PHONE_LABELS;
  if (!allowed.includes(label as never)) {
    return { data: null, error: "種別が不正です" };
  }

  const table = channel === "email" ? "contact_emails" : "contact_phones";

  // 1 件も無ければ主にする（主が空のままにしない）
  const { count } = await auth.supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId);

  const common = {
    contact_id: contactId,
    label,
    is_primary: (count ?? 0) === 0,
    created_by: auth.userId,
    last_updated_by: auth.userId,
  };

  // 列名が違うだけだが、生成型で判別できるよう分けて書く
  const { data, error } =
    channel === "email"
      ? await auth.supabase
          .from("contact_emails")
          .insert({ ...common, email: trimmed })
          .select("id")
          .single()
      : await auth.supabase
          .from("contact_phones")
          .insert({ ...common, phone: trimmed })
          .select("id")
          .single();

  if (error) {
    // UNIQUE (contact_id, email/phone)
    if (error.code === "23505") {
      return { data: null, error: "同じ値が既に登録されています" };
    }
    return { data: null, error: error.message };
  }

  refresh(contactId);
  return { data: { id: data.id }, error: null };
}

// ---------------------------------------------------------------------------
// 種別の変更
// ---------------------------------------------------------------------------
export async function updateContactChannelLabel(
  contactId: string,
  channel: Channel,
  id: string,
  label: string
): Promise<ActionResult<null>> {
  const auth = await authorize(contactId);
  if ("error" in auth) return { data: null, error: auth.error };

  const allowed = channel === "email" ? EMAIL_LABELS : PHONE_LABELS;
  if (!allowed.includes(label as never)) {
    return { data: null, error: "種別が不正です" };
  }

  const table = channel === "email" ? "contact_emails" : "contact_phones";
  const { error } = await auth.supabase
    .from(table)
    .update({ label, last_updated_by: auth.userId })
    .eq("id", id)
    .eq("contact_id", contactId);

  if (error) return { data: null, error: error.message };
  refresh(contactId);
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 主連絡先の切り替え
// ---------------------------------------------------------------------------
export async function setPrimaryContactChannel(
  contactId: string,
  channel: Channel,
  id: string
): Promise<ActionResult<null>> {
  const auth = await authorize(contactId);
  if ("error" in auth) return { data: null, error: auth.error };

  // 「落としてから立てる」順序が要るため DB 関数で行う
  const { error } = await auth.supabase.rpc(
    channel === "email" ? "set_primary_contact_email" : "set_primary_contact_phone",
    { p_id: id, p_actor: auth.userId }
  );

  if (error) return { data: null, error: error.message };
  refresh(contactId);
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 削除の下見
//
// 名刺がこの連絡手段を指している場合、削除すると紐付けが外れる。
// 消す前に件数を見せる
// ---------------------------------------------------------------------------
export async function countCardsUsingChannel(
  contactId: string,
  channel: Channel,
  id: string
): Promise<number> {
  const auth = await authorize(contactId);
  if ("error" in auth) return 0;

  const column = channel === "email" ? "contact_email_id" : "contact_phone_id";
  const { count } = await auth.supabase
    .from("business_cards")
    .select("id", { count: "exact", head: true })
    .eq(column, id);

  return count ?? 0;
}

// ---------------------------------------------------------------------------
// 削除
// ---------------------------------------------------------------------------
export async function deleteContactChannel(
  contactId: string,
  channel: Channel,
  id: string
): Promise<ActionResult<null>> {
  const auth = await authorize(contactId);
  if ("error" in auth) return { data: null, error: auth.error };

  const table = channel === "email" ? "contact_emails" : "contact_phones";
  const { error } = await auth.supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("contact_id", contactId);

  if (error) return { data: null, error: error.message };

  // 主を消した場合の繰り上げは DB のトリガーが行う
  refresh(contactId);
  return { data: null, error: null };
}

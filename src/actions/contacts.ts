"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createContactSchema,
  updateContactSchema,
  createContactEmailSchema,
  createContactPhoneSchema,
} from "@/lib/validators/contacts";

type ActionResult<T> = { data: T | null; error: string | null };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, role: null };
  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, user, role: crmUser?.role ?? null };
}

// ---------------------------------------------------------------------------
// 一覧取得
// ---------------------------------------------------------------------------
export async function getContacts(
  params?: { search?: string; page?: number; perPage?: number }
): Promise<ActionResult<{ rows: unknown[]; count: number }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("contacts")
    .select(
      `*, contact_status:contact_statuses(id, name), company:companies(id, name), owner:crm_users!contacts_owner_user_id_fkey(id, full_name), contact_emails(id, email, label, is_primary), contact_phones(id, phone, label, is_primary)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params?.search) {
    query = query.or(
      `last_name.ilike.%${params.search}%,first_name.ilike.%${params.search}%,contact_code.ilike.%${params.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], count: count ?? 0 }, error: null };
}

// ---------------------------------------------------------------------------
// 詳細取得
// ---------------------------------------------------------------------------
export async function getContact(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `*, contact_status:contact_statuses(id, name), company:companies(id, name), owner:crm_users!contacts_owner_user_id_fkey(id, full_name), contact_emails(id, email, label, is_primary), contact_phones(id, phone, label, is_primary), talent:talents(*, talent_skills(*, skill:skills(id, name, skill_categories(name))), talent_careers(*)), number_diagnosis(*), constellation_fortune_telling:constellation_fortune_telling(*), account_contacts(id, role, account:accounts(id, account_code, name))`
    )
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 作成
// ---------------------------------------------------------------------------
export async function createContact(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const values = {
    ...parsed.data,
    owner_user_id: parsed.data.owner_user_id ?? user.id,
  };

  const { data, error } = await supabase
    .from("contacts")
    .insert(values)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------
export async function updateContact(
  id: string,
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("contacts").select("owner_user_id").eq("id", id).single();
    if (!existing) return { data: null, error: "コンタクトが見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "このコンタクトを編集する権限がありません" };
  }

  const parsed = updateContactSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  // 変更前データ取得
  const { data: before, error: fetchErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) return { data: null, error: fetchErr.message };

  // status_updated_at をステータス変更時に更新
  const updates: Record<string, unknown> = { ...parsed.data };
  if (
    parsed.data.contact_status_id &&
    parsed.data.contact_status_id !== before.contact_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return { data: null, error: error.message };

  // 変更履歴記録
  const changedFields = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  const histories = changedFields
    .filter((key) => parsed.data[key] !== before[key])
    .map((field) => ({
      contact_id: id,
      field_name: field as string,
      old_value: before[field] != null ? String(before[field]) : null,
      new_value:
        parsed.data[field] != null ? String(parsed.data[field]) : null,
      changed_by: user.id,
    }));

  if (histories.length > 0) {
    await supabase.from("contact_change_histories").insert(histories);
  }

  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 論理削除
// ---------------------------------------------------------------------------
export async function deleteContact(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("contacts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// メールアドレス追加
// ---------------------------------------------------------------------------
export async function addContactEmail(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("contact_emails")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// メールアドレス更新
// ---------------------------------------------------------------------------
export async function updateContactEmail(
  id: string,
  input: { email?: string; label?: string; is_primary?: boolean }
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_emails")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// メールアドレス削除
// ---------------------------------------------------------------------------
export async function deleteContactEmail(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("contact_emails")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 電話番号追加
// ---------------------------------------------------------------------------
export async function addContactPhone(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactPhoneSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("contact_phones")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 電話番号更新
// ---------------------------------------------------------------------------
export async function updateContactPhone(
  id: string,
  input: { phone?: string; label?: string; is_primary?: boolean }
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_phones")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 電話番号削除
// ---------------------------------------------------------------------------
export async function deleteContactPhone(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("contact_phones")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

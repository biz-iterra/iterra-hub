"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createAccountSchema,
  updateAccountSchema,
  createAccountContactSchema,
} from "@/lib/validators/accounts";

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
export async function getAccounts(
  params?: { search?: string; page?: number; perPage?: number }
): Promise<ActionResult<{ rows: unknown[]; count: number }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("accounts")
    .select(
      `*, company:companies(id, name), account_type:account_types(id, name), account_status:account_statuses(id, name), owner:crm_users!accounts_owner_user_id_fkey(id, full_name)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params?.search) {
    query = query.or(
      `name.ilike.%${params.search}%,account_code.ilike.%${params.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], count: count ?? 0 }, error: null };
}

// ---------------------------------------------------------------------------
// 詳細取得
// ---------------------------------------------------------------------------
export async function getAccount(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("accounts")
    .select(
      `*, company:companies(id, name), account_type:account_types(id, name), account_status:account_statuses(id, name), owner:crm_users!accounts_owner_user_id_fkey(id, full_name), contacts:account_contacts(id, role, contact:contacts(id, contact_code, last_name, first_name, department, job_title, deleted_at)), deals(id, deal_code, name, amount, deal_stage:deal_stages(name), deal_status:deal_statuses(name))`
    )
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 作成
// ---------------------------------------------------------------------------
export async function createAccount(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const values = {
    ...parsed.data,
    owner_user_id: parsed.data.owner_user_id ?? user.id,
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from("accounts")
    .insert(values)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------
export async function updateAccount(
  id: string,
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("accounts").select("owner_user_id").eq("id", id).single();
    if (!existing) return { data: null, error: "アカウントが見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "このアカウントを編集する権限がありません" };
  }

  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  // 変更前データ取得
  const { data: before, error: fetchErr } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) return { data: null, error: fetchErr.message };

  // status_updated_at をステータス変更時に更新
  const updates: Record<string, unknown> = { ...parsed.data };
  if (
    parsed.data.account_status_id &&
    parsed.data.account_status_id !== before.account_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("accounts")
    .update({ ...updates, last_updated_by: user.id })
    .eq("id", id)
    .select()
    .single();
  if (error) return { data: null, error: error.message };

  // 変更履歴記録
  const changedFields = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  const histories = changedFields
    .filter((key) => parsed.data[key] !== before[key])
    .map((field) => ({
      account_id: id,
      field_name: field as string,
      old_value: before[field] != null ? String(before[field]) : null,
      new_value:
        parsed.data[field] != null ? String(parsed.data[field]) : null,
      changed_by: user.id,
    }));

  if (histories.length > 0) {
    await supabase.from("account_change_histories").insert(histories);
  }

  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 論理削除
// ---------------------------------------------------------------------------
export async function deleteAccount(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  // 配下にアクティブなディールが存在するか確認（closed_at IS NULL かつ 未削除）
  const { count } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("account_id", id)
    .is("closed_at", null)
    .is("deleted_at", null);

  if (count && count > 0) {
    return {
      data: null,
      error: "アクティブなディールが存在するため削除できません",
    };
  }

  const { error } = await supabase
    .from("accounts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// アカウントコンタクト追加
// ---------------------------------------------------------------------------
export async function addAccountContact(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createAccountContactSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("account_contacts")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// アカウントコンタクト削除
// ---------------------------------------------------------------------------
export async function removeAccountContact(
  accountId: string,
  contactId: string
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("account_contacts")
    .delete()
    .eq("account_id", accountId)
    .eq("contact_id", contactId);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

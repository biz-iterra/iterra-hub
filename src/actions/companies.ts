"use server";

import { createClient } from "@/lib/supabase/server";
import { createCompanySchema, updateCompanySchema } from "@/lib/validators";

type ActionResult<T> = { data: T | null; error: string | null };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, role: null };
  const { data: crmUser } = await supabase.from("crm_users").select("role").eq("id", user.id).single();
  return { supabase, user, role: crmUser?.role ?? null };
}

// 一覧取得（検索・ページネーション対応）
export async function getCompanies(params?: {
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<ActionResult<{ items: any[]; total: number }>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("companies")
    .select("*, corporate_types(name), lead_sources(name), company_status:company_statuses(id, name), crm_users!companies_owner_user_id_fkey(full_name)", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params?.search) {
    query = query.or(`name.ilike.%${params.search}%,name_kana.ilike.%${params.search}%,company_code.ilike.%${params.search}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { items: data ?? [], total: count ?? 0 }, error: null };
}

// 詳細取得
export async function getCompany(id: string): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("companies")
    .select(`
      *,
      corporate_types(id, name),
      lead_sources(id, name),
      company_status:company_statuses(id, name),
      industry_classifications(id, major_name, middle_name, minor_name),
      crm_users!companies_owner_user_id_fkey(id, full_name),
      primary_contact:contacts!companies_primary_contact_id_fkey(id, contact_code, last_name, first_name),
      accounts(id, account_code, name, deleted_at),
      contacts!contacts_company_id_fkey(id, contact_code, last_name, first_name, department, job_title, deleted_at)
    `)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 作成
export async function createCompany(input: Record<string, unknown>): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createCompanySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("companies")
    .insert({ ...parsed.data, owner_user_id: parsed.data.owner_user_id ?? user.id, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 更新
export async function updateCompany(id: string, input: Record<string, unknown>): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("companies").select("owner_user_id").eq("id", id).single();
    if (!existing) return { data: null, error: "カンパニーが見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "このカンパニーを編集する権限がありません" };
  }

  const parsed = updateCompanySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // 変更前データ取得（変更履歴用）
  const { data: before } = await supabase.from("companies").select("*").eq("id", id).single();

  // status_updated_at はステータス変更時に更新
  const updates: Record<string, unknown> = { ...parsed.data };
  if (
    before &&
    parsed.data.company_status_id &&
    parsed.data.company_status_id !== before.company_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from("companies").update({ ...updates, last_updated_by: user.id }).eq("id", id).select().single();
  if (error) return { data: null, error: error.message };

  // 変更履歴記録
  if (before && data) {
    const changes: { field_name: string; old_value: string | null; new_value: string | null }[] = [];
    for (const [key, newVal] of Object.entries(parsed.data as Record<string, any>)) {
      const oldVal = (before as any)[key];
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        changes.push({ field_name: key, old_value: String(oldVal ?? ""), new_value: String(newVal ?? "") });
      }
    }
    if (changes.length > 0) {
      await supabase.from("company_change_histories").insert(
        changes.map((c) => ({ company_id: id, ...c, changed_by: user.id }))
      );
    }
  }

  return { data, error: null };
}

// 論理削除
export async function deleteCompany(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  // 配下 accounts チェック（削除されていないもの）
  const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true }).eq("company_id", id).is("deleted_at", null);
  if (count && count > 0) return { data: null, error: "紐づくアカウントが存在するため削除できません" };

  const { error } = await supabase.from("companies").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
    last_updated_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

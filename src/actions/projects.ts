"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createProjectSchema,
  updateProjectSchema,
  createProjectMemberSchema,
  createDealProjectSchema,
} from "@/lib/validators/projects";
import { revalidatePath } from "next/cache";

type ActionResult<T> = { data: T | null; error: string | null };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, role: null };
  const { data: crmUser } = await supabase.from("crm_users").select("role").eq("id", user.id).single();
  return { supabase, user, role: crmUser?.role ?? null };
}

// ---------------------------------------------------------------------------
// 一覧取得（検索・ページネーション対応）
// ---------------------------------------------------------------------------
export async function getProjects(params?: {
  search?: string;
  statusId?: string;
  ownerUserId?: string;
  page?: number;
  perPage?: number;
}): Promise<ActionResult<{ rows: any[]; total: number }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("projects")
    .select(
      "*, project_status:project_statuses(id, name), owner:crm_users!projects_owner_user_id_fkey(id, full_name)",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params?.search) {
    query = query.or(`name.ilike.%${params.search}%,project_code.ilike.%${params.search}%`);
  }
  if (params?.statusId) {
    query = query.eq("project_status_id", params.statusId);
  }
  if (params?.ownerUserId) {
    query = query.eq("owner_user_id", params.ownerUserId);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------------------------------------------------------------------------
// 詳細取得
// ---------------------------------------------------------------------------
export async function getProject(id: string): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      project_status:project_statuses(id, name, sort_order),
      owner:crm_users!projects_owner_user_id_fkey(id, full_name),
      project_members(
        id, user_id, created_at,
        user:crm_users!project_members_user_id_fkey(id, full_name, email, role)
      ),
      deal_projects(
        id, deal_id, created_at,
        deal:deals(
          id, deal_code, name, amount, closed_at,
          account:accounts(id, name, account_code),
          pipeline_type:pipeline_types(id, name),
          deal_stage:deal_stages(id, name, sort_order),
          deal_status:deal_statuses(id, name, sort_order)
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 作成
// ---------------------------------------------------------------------------
export async function createProject(
  input: Record<string, unknown>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "input";
    const inputObj = (input ?? {}) as Record<string, unknown>;
    const received = field in inputObj ? inputObj[field] : "(キー自体が未送信)";
    return {
      data: null,
      error: `[${field}] ${issue.message} / 受信値: ${JSON.stringify(received)}`,
    };
  }

  const values = {
    ...parsed.data,
    owner_user_id: parsed.data.owner_user_id ?? user.id,
    created_by: user.id,
    last_updated_by: user.id,
    status_updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("projects")
    .insert(values)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  revalidatePath("/projects");
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------
export async function updateProject(
  id: string,
  input: Record<string, unknown>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "input";
    const inputObj = (input ?? {}) as Record<string, unknown>;
    const received = field in inputObj ? inputObj[field] : "(キー自体が未送信)";
    return {
      data: null,
      error: `[${field}] ${issue.message} / 受信値: ${JSON.stringify(received)}`,
    };
  }

  const { data: before, error: fetchErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) return { data: null, error: fetchErr.message };

  const updates: Record<string, unknown> = {
    ...parsed.data,
    last_updated_by: user.id,
  };
  if (
    parsed.data.project_status_id &&
    parsed.data.project_status_id !== before.project_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return { data: null, error: error.message };

  // 変更履歴記録
  const histories = Object.keys(parsed.data)
    .filter((key) => (parsed.data as Record<string, unknown>)[key] !== before[key])
    .map((field) => ({
      project_id: id,
      field_name: field,
      old_value: before[field] != null ? String(before[field]) : null,
      new_value:
        (parsed.data as Record<string, unknown>)[field] != null
          ? String((parsed.data as Record<string, unknown>)[field])
          : null,
      changed_by: user.id,
    }));

  if (histories.length > 0) {
    await supabase.from("project_change_histories").insert(histories);
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 論理削除
// ---------------------------------------------------------------------------
export async function deleteProject(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("projects")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      last_updated_by: user.id,
      is_active: false,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/projects");
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// プロジェクトメンバー追加
// ---------------------------------------------------------------------------
export async function addProjectMember(
  input: Record<string, unknown>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = createProjectMemberSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("project_members")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// プロジェクトメンバー削除
// ---------------------------------------------------------------------------
export async function removeProjectMember(
  projectId: string,
  userId: string
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${projectId}`);
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 配下ディールの担当者を一括メンバー化
// ---------------------------------------------------------------------------
export async function bulkAddMembersFromDeals(
  projectId: string
): Promise<ActionResult<{ added: number }>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  // 配下ディールの owner_user_id を収集
  const { data: dealProjects, error: dpErr } = await supabase
    .from("deal_projects")
    .select("deal:deals(owner_user_id)")
    .eq("project_id", projectId);
  if (dpErr) return { data: null, error: dpErr.message };

  const ownerIds = new Set<string>();
  for (const dp of dealProjects ?? []) {
    // Supabase 型推論が deal をリレーション配列と解釈するケースがあるため unknown 経由で narrow
    const deal = (dp.deal as unknown) as { owner_user_id: string | null } | { owner_user_id: string | null }[] | null;
    if (!deal) continue;
    const ownerId = Array.isArray(deal) ? deal[0]?.owner_user_id : deal.owner_user_id;
    if (ownerId) ownerIds.add(ownerId);
  }
  if (ownerIds.size === 0) return { data: { added: 0 }, error: null };

  // 既存メンバーを除外
  const { data: existing } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);
  for (const m of existing ?? []) ownerIds.delete(m.user_id);

  if (ownerIds.size === 0) return { data: { added: 0 }, error: null };

  const rows = Array.from(ownerIds).map((uid) => ({
    project_id: projectId,
    user_id: uid,
    created_by: user.id,
  }));

  const { error: insErr } = await supabase.from("project_members").insert(rows);
  if (insErr) return { data: null, error: insErr.message };

  revalidatePath(`/projects/${projectId}`);
  return { data: { added: rows.length }, error: null };
}

// ---------------------------------------------------------------------------
// ディール紐づけ追加
// ---------------------------------------------------------------------------
export async function addDealProject(
  input: Record<string, unknown>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = createDealProjectSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("deal_projects")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${parsed.data.project_id}`);
  revalidatePath(`/deals/${parsed.data.deal_id}`);
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// ディール紐づけ削除
// ---------------------------------------------------------------------------
export async function removeDealProject(
  dealId: string,
  projectId: string
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const { error } = await supabase
    .from("deal_projects")
    .delete()
    .eq("deal_id", dealId)
    .eq("project_id", projectId);

  if (error) return { data: null, error: error.message };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/deals/${dealId}`);
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// プロジェクトステータス マスタ取得（フォーム用）
// ---------------------------------------------------------------------------
export async function getProjectStatuses(): Promise<ActionResult<any[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("project_statuses")
    .select("id, name, sort_order")
    .is("deleted_at", null)
    .order("sort_order");

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

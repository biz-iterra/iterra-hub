"use server";

import { toUserMessage } from "@/lib/db-error";
import { revalidatePath } from "next/cache";
import { buildIlikePattern } from "@/lib/search-query";
import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import {
  createAccountSchema,
  updateAccountSchema,
  createAccountContactSchema,
  createAccountRoleSchema,
} from "@/lib/validators/accounts";
import type {
  AccountDetail,
  AccountRoleTypeWithPipeline,
  AccountWithRelations,
  Paged,
  Row,
} from "@/types/relations";
import { resolveListSort, SORT_FIELDS, toOrderArgs, type SortParams } from "@/lib/list-sort";

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
  params?: {
    search?: string;
    page?: number;
    perPage?: number;
    statusId?: string;
    accountTypeId?: string;
    ownerUserId?: string;
  } & SortParams
): Promise<ActionResult<Paged<AccountWithRelations>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const sort = resolveListSort(params, SORT_FIELDS.accounts, {
    field: "created_at",
    direction: "desc",
  });

  let query = supabase
    .from("accounts")
    .select(
      `*, company:companies(id, name, invoice_registration_number), account_type:account_types(id, name, slug), account_status:account_statuses(id, name, color), account_roles(id, assigned_by_contract, role_type:account_role_types(id, code, name, color, sort_order)), owner:crm_users!accounts_owner_user_id_fkey(id, full_name)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order(...toOrderArgs(sort))
    .range(from, to);

  const searchPattern = buildIlikePattern(params?.search);
  if (searchPattern) {
    query = query.or(
      `name.ilike.${searchPattern},account_code.ilike.${searchPattern}`
    );
  }
  if (params?.statusId) {
    query = query.eq("account_status_id", params.statusId);
  }
  if (params?.accountTypeId) {
    query = query.eq("account_type_id", params.accountTypeId);
  }
  if (params?.ownerUserId) {
    query = query.eq("owner_user_id", params.ownerUserId);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先" }) };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------------------------------------------------------------------------
// 詳細取得
// ---------------------------------------------------------------------------
export async function getAccount(id: string): Promise<ActionResult<AccountDetail>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("accounts")
    .select(
      `*, company:companies(id, name, invoice_registration_number), account_type:account_types(id, name, slug), account_status:account_statuses(id, name, color), account_roles(id, assigned_by_contract, role_type:account_role_types(id, code, name, color, sort_order)), lead_source:lead_sources(id, name), owner:crm_users!accounts_owner_user_id_fkey(id, full_name), contacts:account_contacts(id, role, contact:contacts(id, contact_code, last_name, first_name, department, job_title, deleted_at, company:companies!contacts_company_id_fkey(id, name))), deals(id, deal_code, name, amount, deal_stage:deal_stages(name), deal_status:deal_statuses(name))`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先" }) };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 作成
// ---------------------------------------------------------------------------
export async function createAccount(
  input: unknown
): Promise<ActionResult<Row<"accounts">>> {
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先" }) };
  revalidatePath("/accounts");
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------
export async function updateAccount(
  id: string,
  input: unknown
): Promise<ActionResult<Row<"accounts">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("accounts").select("owner_user_id").eq("id", id).is("deleted_at", null).single();
    if (!existing) return { data: null, error: "取引先が見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "この取引先を編集する権限がありません" };
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
  if (fetchErr) return { data: null, error: toUserMessage(fetchErr, { entityLabel: "取引先" }) };

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { expected_updated_at, ...fields } = parsed.data;

  // status_updated_at をステータス変更時に更新
  const updates: Record<string, unknown> = { ...fields };
  if (
    fields.account_status_id &&
    fields.account_status_id !== before.account_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("accounts")
    .update({ ...updates, last_updated_by: user.id })
    .eq("id", id);
  if (expected_updated_at) {
    updateQuery = updateQuery.eq("updated_at", expected_updated_at);
  }

  const { data, error } = await updateQuery.select().maybeSingle();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先" }) };
  if (!data) return { data: null, error: conflictErrorMessage("この取引先") };

  // 変更履歴は entity_change_logs のトリガーが自動記録する（20260728000002）

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先", operation: "delete"}) };
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${id}`);
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 取引先の連絡先追加
// ---------------------------------------------------------------------------
export async function addAccountContact(
  input: unknown
): Promise<ActionResult<Row<"account_contacts">>> {
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先" }) };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 取引先の連絡先削除
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先", operation: "delete"}) };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 取引先区分（顧客・仕入れ先など）
//
// 契約成立時にはトリガーが自動で付与する（パイプライン連動）。
// ここは担当者が手で付け外しする経路。
// ---------------------------------------------------------------------------
export async function getAccountRoleTypes(): Promise<
  ActionResult<AccountRoleTypeWithPipeline[]>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("account_role_types")
    .select("*, pipeline_type:pipeline_types(id, name)")
    .is("deleted_at", null)
    .order("sort_order");

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先" }) };
  return { data: data ?? [], error: null };
}

export async function addAccountRole(
  input: unknown
): Promise<ActionResult<Row<"account_roles">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createAccountRoleSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".") || "input"}] ${issue.message}` };
  }

  // 付与可否は RLS（親 accounts の owner / admin）が判定する
  const { data, error } = await supabase
    .from("account_roles")
    .insert({
      account_id: parsed.data.account_id,
      role_type_id: parsed.data.role_type_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先" }) };
  return { data, error: null };
}

export async function removeAccountRole(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase.from("account_roles").delete().eq("id", id);
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "取引先", operation: "delete"}) };
  return { data: null, error: null };
}

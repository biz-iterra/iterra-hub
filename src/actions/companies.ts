"use server";

import {
  detectCorporateType,
  formatCompanyName,
  stripCorporateType,
} from "@/lib/company-name";
import { toKatakanaReading } from "@/lib/kana";
import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import { createCompanySchema, updateCompanySchema } from "@/lib/validators";
import { createCompanyDomainSchema } from "@/lib/validators/companies";
import type {
  CompanyDetail,
  CompanyWithRelations,
  Paged,
  Row,
} from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, role: null };
  const { data: crmUser } = await supabase.from("crm_users").select("role").eq("id", user.id).single();
  return { supabase, user, role: crmUser?.role ?? null };
}

/**
 * 会社名を正式表記に整え、空いている法人格とフリガナを補う。
 *
 * 略記のまま保存すると同じ法人が別々に登録されるため（20260802000003）、
 * 画面からの保存でも名刺取込と同じ規則を通す。
 * 法人格とフリガナは**人が入れた値を優先**し、空のときだけ補う。
 */
async function applyCompanyNameRules<
  T extends {
    name?: string | null;
    name_kana?: string | null;
    corporate_type_id?: string | null;
  }
>(
  supabase: NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"]>,
  values: T
): Promise<T> {
  // 名前が更新対象に含まれていないときは触らない
  if (typeof values.name !== "string" || !values.name) return values;

  const name = formatCompanyName(values.name);
  const result: T = { ...values, name };

  // フリガナは読みの下書き。正確とは限らないので人の入力を上書きしない。
  // 法人格は呼び名に含めないので落としてから読む
  if (!result.name_kana?.trim()) {
    const reading = await toKatakanaReading(stripCorporateType(name));
    if (reading) result.name_kana = reading;
  }

  if (result.corporate_type_id) return result;

  const { data: types } = await supabase
    .from("corporate_types")
    .select("id, name")
    .is("deleted_at", null);

  result.corporate_type_id = detectCorporateType(name, types ?? [])?.id ?? null;
  return result;
}

/**
 * 会社名からフリガナの下書きを作る。
 *
 * 形態素解析の読みなので**正確とは限らない**。画面では編集できる状態で見せ、
 * 人が直せるようにする。法人格は呼び名に含めない。
 */
export async function suggestCompanyKana(
  name: string
): Promise<ActionResult<string>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  return { data: await toKatakanaReading(stripCorporateType(name)), error: null };
}

// 一覧取得（検索・ページネーション対応）
export async function getCompanies(params?: {
  search?: string;
  page?: number;
  perPage?: number;
  statusId?: string;
  corporateTypeId?: string;
  ownerUserId?: string;
}): Promise<ActionResult<Paged<CompanyWithRelations>>> {
  // 参照範囲は RLS が制御するため、ここでロールは使わない
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("companies")
    .select("*, corporate_types(id, name), lead_sources(name), company_status:company_statuses(id, name, color), crm_users!companies_owner_user_id_fkey(id, full_name)", { count: "exact" })
    .is("deleted_at", null)
    // 法人格を除いた名称の順に並べる（20260802000008）。
    // 件数が多く、登録順では目当ての事業者を辿れないため
    .order("sort_key", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (params?.search) {
    query = query.or(`name.ilike.%${params.search}%,name_kana.ilike.%${params.search}%,company_code.ilike.%${params.search}%`);
  }
  if (params?.statusId) {
    query = query.eq("company_status_id", params.statusId);
  }
  if (params?.corporateTypeId) {
    query = query.eq("corporate_type_id", params.corporateTypeId);
  }
  if (params?.ownerUserId) {
    query = query.eq("owner_user_id", params.ownerUserId);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// 詳細取得
export async function getCompany(id: string): Promise<ActionResult<CompanyDetail>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("companies")
    .select(`
      *,
      corporate_types(id, name),
      lead_sources(id, name),
      company_status:company_statuses(id, name, color),
      industry_classifications(id, major_name, middle_name, minor_name),
      crm_users!companies_owner_user_id_fkey(id, full_name),
      verifier:crm_users!companies_verified_by_fkey(id, full_name),
      primary_contact:contacts!companies_primary_contact_id_fkey(id, contact_code, last_name, first_name),
      accounts(id, account_code, name, deleted_at),
      contacts!contacts_company_id_fkey(id, contact_code, last_name, first_name, department, job_title, deleted_at),
      company_domains(id, domain, is_primary)
    `)
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 作成
export async function createCompany(input: Record<string, unknown>): Promise<ActionResult<Row<"companies">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createCompanySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const values = await applyCompanyNameRules(supabase, parsed.data);

  const { data, error } = await supabase
    .from("companies")
    .insert({ ...values, owner_user_id: values.owner_user_id ?? user.id, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 更新
export async function updateCompany(id: string, input: Record<string, unknown>): Promise<ActionResult<Row<"companies">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("companies").select("owner_user_id").eq("id", id).single();
    if (!existing) return { data: null, error: "事業者情報が見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "この事業者情報を編集する権限がありません" };
  }

  const parsed = updateCompanySchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // 変更前データ取得（変更履歴用）
  const { data: before } = await supabase.from("companies").select("*").eq("id", id).single();

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { expected_updated_at, ...rest } = parsed.data;
  const fields = await applyCompanyNameRules(supabase, rest);

  // status_updated_at はステータス変更時に更新
  const updates: Record<string, unknown> = { ...fields };
  if (
    before &&
    fields.company_status_id &&
    fields.company_status_id !== before.company_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("companies")
    .update({ ...updates, last_updated_by: user.id })
    .eq("id", id);
  if (expected_updated_at) {
    updateQuery = updateQuery.eq("updated_at", expected_updated_at);
  }

  const { data, error } = await updateQuery.select().maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: conflictErrorMessage("この事業者情報") };

  // 変更履歴記録
  if (before && data) {
    // 変更履歴は entity_change_logs のトリガーが自動記録する（20260728000002）
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
  if (count && count > 0) return { data: null, error: "紐づく取引先が存在するため削除できません" };

  const { error } = await supabase.from("companies").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
    last_updated_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 法人ドメイン
//
// 正規化・フリーメール判定・重複チェック・代表フラグの付け替えはすべて
// DB 関数 upsert_company_domain が行う。ここは入力の受け渡しに徹する
// （値の整形は TS、複数テーブル/複数文の書き込みは DB 側という分担）。
// ---------------------------------------------------------------------------
export async function addCompanyDomain(
  input: unknown
): Promise<ActionResult<Row<"company_domains">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createCompanyDomainSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "input";
    return { data: null, error: `[${field}] ${issue.message}` };
  }

  const { data, error } = await supabase.rpc("upsert_company_domain", {
    p_company_id: parsed.data.company_id,
    p_input: parsed.data.domain,
    p_is_primary: parsed.data.is_primary ?? false,
  });

  if (error) return { data: null, error: error.message };
  return { data: data as Row<"company_domains">, error: null };
}

/** 代表ドメインの切り替え。登録と同じ関数を通すことで付け替えを原子的に行う */
export async function setPrimaryCompanyDomain(
  companyId: string,
  domain: string
): Promise<ActionResult<Row<"company_domains">>> {
  return addCompanyDomain({ company_id: companyId, domain, is_primary: true });
}

export async function deleteCompanyDomain(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // 削除可否は RLS（親 companies の owner / admin）が判定する
  const { error } = await supabase.from("company_domains").delete().eq("id", id);
  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}
"use server";

import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import {
  createTalentSchema,
  updateTalentSchema,
  createTalentSkillSchema,
  updateTalentSkillSchema,
  createTalentCareerSchema,
  updateTalentCareerSchema,
} from "@/lib/validators";
import type { z } from "zod";

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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 対象タレントを編集できるか判定する。
 * talent_careers の RLS は全操作 USING(true) のため、Server Action 層が唯一の防御になる。
 * 基準は contacts と揃え、manager 以上は全件、member は親コンタクトのオーナーのみ。
 */
async function canModifyTalent(
  supabase: SupabaseServerClient,
  userId: string,
  role: string | null,
  talentId: string
): Promise<boolean> {
  if (role === "manager" || role === "admin") return true;

  const { data } = await supabase
    .from("talents")
    .select("contact:contacts(owner_user_id)")
    .eq("id", talentId)
    .single();

  const contact = (data as { contact?: { owner_user_id?: string } | null } | null)
    ?.contact;
  return contact?.owner_user_id === userId;
}

/** talent_careers.id から親の talent_id を引く */
async function getCareerTalentId(
  supabase: SupabaseServerClient,
  careerId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("talent_careers")
    .select("talent_id")
    .eq("id", careerId)
    .single();
  return (data as { talent_id?: string } | null)?.talent_id ?? null;
}

const TALENT_LIST_SELECT = `
  *,
  contact:contacts(id, contact_code, last_name, first_name, department, job_title),
  talent_skills(id, proficiency_level, years_experience, skill:skills(id, skill_code, axis, name, system_tags, skill_categories(name)))
` as const;

// ---------- 一覧取得 ----------
export async function getTalents(params?: {
  search?: string;
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
    .from("talents")
    .select(TALENT_LIST_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .range(from, to);

  if (params?.search) {
    query = query.or(
      `contact.last_name.ilike.%${params.search}%,contact.first_name.ilike.%${params.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------- 詳細取得 ----------
export async function getTalent(id: string): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("talents")
    .select(
      `
      *,
      contact:contacts(
        id, contact_code, last_name, first_name, department, job_title,
        number_diagnosis(*),
        constellation_fortune_telling:constellation_fortune_telling(*)
      ),
      talent_skills(id, proficiency_level, years_experience, note, skill:skills(id, skill_code, axis, name, system_tags, skill_categories(name))),
      talent_careers(*)
    `
    )
    .eq("id", id)
    .order("sort_order", { referencedTable: "talent_careers", ascending: true })
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- 作成 ----------
export async function createTalent(
  input: z.infer<typeof createTalentSchema>
): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createTalentSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("talents")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- 更新 ----------
export async function updateTalent(
  id: string,
  input: z.infer<typeof updateTalentSchema>
): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = updateTalentSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // 変更前データ取得
  const { data: current, error: fetchError } = await supabase
    .from("talents")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError) return { data: null, error: fetchError.message };

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { expected_updated_at, ...fields } = parsed.data;

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("talents")
    .update({ ...fields, last_updated_by: user.id })
    .eq("id", id);
  if (expected_updated_at) {
    updateQuery = updateQuery.eq("updated_at", expected_updated_at);
  }

  const { data, error } = await updateQuery.select().maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: conflictErrorMessage("このタレント") };

  // 変更履歴は entity_change_logs のトリガーが自動記録する（20260728000002）

  return { data, error: null };
}

// ---------- 論理削除 ----------
export async function deleteTalent(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("talents")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      last_updated_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------- スキル追加 ----------
export async function addTalentSkill(
  input: z.infer<typeof createTalentSkillSchema>
): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createTalentSkillSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("talent_skills")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- スキル更新 ----------
export async function updateTalentSkill(
  id: string,
  input: z.infer<typeof updateTalentSkillSchema>
): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = updateTalentSkillSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("talent_skills")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- スキル削除 ----------
export async function removeTalentSkill(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("talent_skills")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------- キャリア追加 ----------
export async function addTalentCareer(
  input: z.infer<typeof createTalentCareerSchema>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createTalentCareerSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  if (!(await canModifyTalent(supabase, user.id, role, parsed.data.talent_id))) {
    return { data: null, error: "このタレントを編集する権限がありません" };
  }

  const { data, error } = await supabase
    .from("talent_careers")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- キャリア更新 ----------
export async function updateTalentCareer(
  id: string,
  input: z.infer<typeof updateTalentCareerSchema>
): Promise<ActionResult<any>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  if (!UUID_REGEX.test(id)) return { data: null, error: "不正なパラメータです" };

  const parsed = updateTalentCareerSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const talentId = await getCareerTalentId(supabase, id);
  if (!talentId) return { data: null, error: "経歴が見つかりません" };
  if (!(await canModifyTalent(supabase, user.id, role, talentId))) {
    return { data: null, error: "このタレントを編集する権限がありません" };
  }

  const { data, error } = await supabase
    .from("talent_careers")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------- キャリア削除 ----------
export async function removeTalentCareer(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  if (!UUID_REGEX.test(id)) return { data: null, error: "不正なパラメータです" };

  const talentId = await getCareerTalentId(supabase, id);
  if (!talentId) return { data: null, error: "経歴が見つかりません" };
  if (!(await canModifyTalent(supabase, user.id, role, talentId))) {
    return { data: null, error: "このタレントを編集する権限がありません" };
  }

  const { error } = await supabase
    .from("talent_careers")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

"use server";

import { createClient } from "@/lib/supabase/server";
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

const TALENT_LIST_SELECT = `
  *,
  contact:contacts(id, contact_code, last_name, first_name, department, job_title),
  talent_skills(id, proficiency_level, skill:skills(id, name, skill_categories(name)))
` as const;

// ---------- 一覧取得 ----------
export async function getTalents(params?: {
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<ActionResult<{ items: any[]; count: number }>> {
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
  return { data: { items: data ?? [], count: count ?? 0 }, error: null };
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
      talent_skills(id, proficiency_level, skill:skills(id, name, skill_categories(name))),
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

  const { data, error } = await supabase
    .from("talents")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  // 変更履歴記録
  const changes: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(parsed.data)) {
    if (parsed.data[key as keyof typeof parsed.data] !== current[key]) {
      changes[key] = {
        from: current[key],
        to: parsed.data[key as keyof typeof parsed.data],
      };
    }
  }
  if (Object.keys(changes).length > 0) {
    await supabase.from("talent_change_histories").insert({
      talent_id: id,
      changes: JSON.stringify(changes),
      changed_by: user.id,
    });
  }

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
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createTalentCareerSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

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
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = updateTalentCareerSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

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
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("talent_careers")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

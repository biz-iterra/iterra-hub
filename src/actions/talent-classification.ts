"use server";

import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { UUID_REGEX } from "@/lib/validators/common";
import {
  createTalentAchievementSchema,
  updateTalentAchievementSchema,
  type TalentAchievement,
  type TalentAchievementMaster,
  type TalentAchievementWithMaster,
  type TalentGrade,
  type TalentGradeRequirement,
  type TalentJobType,
  type TalentSystemTag,
} from "@/lib/validators/talent-classification";
import { calculateTalentProfile } from "@/lib/talent-classification";
import type {
  TalentClassificationMasters,
  TalentProfileResult,
  TalentSkillForClassification,
} from "@/lib/talent-classification";
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

/**
 * 実績の登録・更新・削除は manager 以上に限定する。
 * RLS（20260421000002）では member もオーナー配下の talent なら書き込めるため、
 * Server Action 層で UI（canEdit）と同じ基準に揃える。
 */
function isManagerOrAbove(role: string | null): boolean {
  return role === "manager" || role === "admin";
}

// ============================================================
// 系統マスタ取得（3件）
// ============================================================
export async function getTalentSystemTags(): Promise<
  ActionResult<TalentSystemTag[]>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("talent_system_tags")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: (data ?? []) as TalentSystemTag[], error: null };
}

// ============================================================
// グレードマスタ取得（16件）
// ============================================================
export async function getTalentGrades(): Promise<ActionResult<TalentGrade[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("talent_grades")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: (data ?? []) as TalentGrade[], error: null };
}

// ============================================================
// 昇格要件マスタ取得（最大36件）
// system_code でフィルタ可能
// ============================================================
export async function getTalentGradeRequirements(params?: {
  system_code?: string;
}): Promise<ActionResult<TalentGradeRequirement[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  let query = supabase
    .from("talent_grade_requirements")
    .select("*")
    .order("sort_order", { ascending: true });

  if (params?.system_code) {
    query = query.eq("system_code", params.system_code);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: (data ?? []) as TalentGradeRequirement[], error: null };
}

// ============================================================
// 職種マスタ取得（19件）
// ============================================================
export async function getTalentJobTypes(): Promise<
  ActionResult<TalentJobType[]>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("talent_job_types")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: (data ?? []) as TalentJobType[], error: null };
}

// ============================================================
// 実績マスタ取得（9件）
// ============================================================
export async function getTalentAchievementsMaster(): Promise<
  ActionResult<TalentAchievementMaster[]>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("talent_achievements_master")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: (data ?? []) as TalentAchievementMaster[], error: null };
}

// ============================================================
// タレント実績取得（talent_id 指定）
// ============================================================
export async function getTalentAchievements(
  talent_id: string
): Promise<ActionResult<TalentAchievementWithMaster[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  if (!UUID_REGEX.test(talent_id)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const { data, error } = await supabase
    .from("talent_achievements")
    .select(`
      *,
      master:talent_achievements_master(achievement_code, name, criteria, quantitative_threshold)
    `)
    .eq("talent_id", talent_id)
    .order("achievement_code", { ascending: true });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: (data ?? []) as TalentAchievementWithMaster[], error: null };
}

// ============================================================
// タレント実績追加（manager 以上）
// ============================================================
export async function addTalentAchievement(
  input: z.infer<typeof createTalentAchievementSchema>
): Promise<ActionResult<TalentAchievementWithMaster>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (!isManagerOrAbove(role)) {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const parsed = createTalentAchievementSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("talent_achievements")
    .insert(parsed.data)
    .select(`
      *,
      master:talent_achievements_master(achievement_code, name, criteria)
    `)
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: data as TalentAchievementWithMaster, error: null };
}

// ============================================================
// タレント実績更新（achieved_at / note のみ変更可・manager 以上）
// ============================================================
export async function updateTalentAchievement(
  id: string,
  input: z.infer<typeof updateTalentAchievementSchema>
): Promise<ActionResult<TalentAchievement>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (!isManagerOrAbove(role)) {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const parsed = updateTalentAchievementSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("talent_achievements")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類" }) };
  return { data: data as TalentAchievement, error: null };
}

// ============================================================
// タレント実績削除（manager 以上）
// ============================================================
export async function removeTalentAchievement(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (!isManagerOrAbove(role)) {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  if (!UUID_REGEX.test(id)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const { error } = await supabase
    .from("talent_achievements")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント分類", operation: "delete"}) };
  return { data: null, error: null };
}

// ============================================================
// タレントプロファイル計算（系統 / グレード / 職種を一括算定）
// ============================================================

/** talent_skills + skills JOIN の生データ */
type TalentSkillJoinRow = {
  proficiency_level: number | null;
  skill: {
    skill_code: string | null;
    axis: string | null;
    system_tags: string[] | null;
  } | null;
};

export async function getTalentProfile(
  talent_id: string
): Promise<ActionResult<TalentProfileResult>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  if (!UUID_REGEX.test(talent_id)) {
    return { data: null, error: "不正なパラメータです" };
  }

  // ── マスタ並行取得 ────────────────────────────────────────────────────────────
  const [
    { data: systemTagsRaw, error: e1 },
    { data: gradesRaw, error: e2 },
    { data: requirementsRaw, error: e3 },
    { data: jobTypesRaw, error: e4 },
  ] = await Promise.all([
    supabase.from("talent_system_tags").select("*").order("sort_order"),
    supabase.from("talent_grades").select("*").order("sort_order"),
    supabase.from("talent_grade_requirements").select("*").order("sort_order"),
    supabase.from("talent_job_types").select("*").order("sort_order"),
  ]);

  if (e1) return { data: null, error: toUserMessage(e1, { entityLabel: "タレント分類" }) };
  if (e2) return { data: null, error: toUserMessage(e2, { entityLabel: "タレント分類" }) };
  if (e3) return { data: null, error: toUserMessage(e3, { entityLabel: "タレント分類" }) };
  if (e4) return { data: null, error: toUserMessage(e4, { entityLabel: "タレント分類" }) };

  // ── タレントスキル取得 ────────────────────────────────────────────────────────
  const { data: talentSkillsRaw, error: e5 } = await supabase
    .from("talent_skills")
    .select(
      "proficiency_level, skill:skills(skill_code, axis, system_tags)"
    )
    .eq("talent_id", talent_id);

  if (e5) return { data: null, error: toUserMessage(e5, { entityLabel: "タレント分類" }) };

  // ── タレント実績取得 ──────────────────────────────────────────────────────────
  const { data: achievementsRaw, error: e6 } = await supabase
    .from("talent_achievements")
    .select("achievement_code")
    .eq("talent_id", talent_id);

  if (e6) return { data: null, error: toUserMessage(e6, { entityLabel: "タレント分類" }) };

  // ── 型変換 ────────────────────────────────────────────────────────────────────
  const talentSkills: TalentSkillForClassification[] = (
    (talentSkillsRaw ?? []) as unknown as TalentSkillJoinRow[]
  ).map((ts) => ({
    skill_code: ts.skill?.skill_code ?? null,
    axis: ts.skill?.axis ?? null,
    system_tags: ts.skill?.system_tags ?? [],
    proficiency_level: ts.proficiency_level ?? 0,
  }));

  const achievements = (
    (achievementsRaw ?? []) as { achievement_code: string }[]
  ).map((a) => a.achievement_code);

  // ── プロファイル計算 ──────────────────────────────────────────────────────────
  const masters: TalentClassificationMasters = {
    systemTags: (systemTagsRaw ?? []) as TalentClassificationMasters["systemTags"],
    grades: (gradesRaw ?? []) as TalentClassificationMasters["grades"],
    requirements: (requirementsRaw ?? []) as unknown as TalentClassificationMasters["requirements"],
    jobTypes: (jobTypesRaw ?? []) as unknown as TalentClassificationMasters["jobTypes"],
  };

  const profile = calculateTalentProfile({
    talentSkills,
    achievements,
    masters,
  });

  return { data: profile, error: null };
}

"use server";

import { toUserMessage } from "@/lib/db-error";
import { revalidatePath } from "next/cache";
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
import type {
  Paged,
  Row,
  TalentDetail,
  TalentWithRelations,
} from "@/types/relations";
import { resolveListSort, SORT_FIELDS, toOrderArgs, type SortParams } from "@/lib/list-sort";
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
 * talents / talent_skills / talent_careers の RLS（20260416040013, 20260416040014）は
 * いずれも「manager 以上は全件、member は親コンタクトの owner_user_id のみ」を基準にしている。
 * Server Action 層でも同じ基準で検証し、RLS だけに依存しない（多層防御）。
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

/** talent_skills.id から親の talent_id を引く */
async function getSkillTalentId(
  supabase: SupabaseServerClient,
  skillRowId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("talent_skills")
    .select("talent_id")
    .eq("id", skillRowId)
    .single();
  return (data as { talent_id?: string } | null)?.talent_id ?? null;
}

// contacts は !inner にする。ポテンシャルタイプでの絞り込みが
// 埋め込みテーブルの列を条件にするため、内部結合でないと効かない。
// talents.contact_id は NOT NULL なので、内部結合にしても件数は変わらない
const TALENT_LIST_SELECT = `
  *,
  contact:contacts!inner(id, contact_code, last_name, first_name, department, job_title, potential_number, number_diagnosis(number, type)),
  talent_skills(id, proficiency_level, years_experience, skill:skills(id, skill_code, axis, name, system_tags, skill_categories(name)))
` as const;

// ---------- 一覧取得 ----------
export async function getTalents(
  params?: {
    search?: string;
    page?: number;
    perPage?: number;
    /** ポテンシャルタイプ（IL+ / PR- など）。number_diagnosis.type の値 */
    potentialType?: string;
  } & SortParams
): Promise<ActionResult<Paged<TalentWithRelations>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;
  const sort = resolveListSort(params, SORT_FIELDS.talents, {
    field: "updated_at",
    direction: "desc",
  });

  let query = supabase
    .from("talents")
    .select(TALENT_LIST_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order(...toOrderArgs(sort))
    .range(from, to);

  if (params?.search) {
    query = query.or(
      `contact.last_name.ilike.%${params.search}%,contact.first_name.ilike.%${params.search}%`
    );
  }

  if (params?.potentialType) {
    // タイプは 12 種、番号は 1〜60。contacts が持つのは番号なので、
    // タイプに対応する番号へ展開してから絞り込む
    const { data: numbers } = await supabase
      .from("number_diagnosis")
      .select("number")
      .eq("type", params.potentialType);
    const list = (numbers ?? []).map((n) => n.number);
    // 該当する番号が無いタイプを指定されたら 0 件にする
    // （空配列を in に渡すと条件が無視されて全件返る）
    query = list.length > 0
      ? query.in("contact.potential_number", list)
      : query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------- 詳細取得 ----------
export async function getTalent(id: string): Promise<ActionResult<TalentDetail>> {
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  // talent_careers.career_type は DB の CHECK 制約で 3 値に限定されているが
  // 生成型では TEXT のままなので、ここで一度だけ絞り込んだ型に寄せる。
  // （詳細は @/types/relations の TalentCareerRow のコメント）
  return { data: data as TalentDetail, error: null };
}

// ---------- 作成 ----------
export async function createTalent(
  input: z.infer<typeof createTalentSchema>
): Promise<ActionResult<Row<"talents">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createTalentSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase
    .from("talents")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  revalidatePath("/talents");
  return { data, error: null };
}

// ---------- 更新 ----------
export async function updateTalent(
  id: string,
  input: z.infer<typeof updateTalentSchema>
): Promise<ActionResult<Row<"talents">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = updateTalentSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  // 存在確認（変更履歴は entity_change_logs のトリガーが記録するため
  // 変更前データをアプリ側で保持する必要はない）
  const { error: fetchError } = await supabase
    .from("talents")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError) return { data: null, error: toUserMessage(fetchError, { entityLabel: "タレント" }) };

  // owner チェック（admin/manager 以外は親コンタクトのオーナーのみ。RLS と同じ基準）
  if (!(await canModifyTalent(supabase, user.id, role, id))) {
    return { data: null, error: "このタレントを編集する権限がありません" };
  }

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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  if (!data) return { data: null, error: conflictErrorMessage("このタレント") };

  // 変更履歴は entity_change_logs のトリガーが自動記録する（20260728000002）

  revalidatePath("/talents");
  revalidatePath(`/talents/${id}`);
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント", operation: "delete"}) };
  revalidatePath("/talents");
  revalidatePath(`/talents/${id}`);
  return { data: null, error: null };
}

// ---------- スキル追加 ----------
export async function addTalentSkill(
  input: z.infer<typeof createTalentSkillSchema>
): Promise<ActionResult<Row<"talent_skills">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createTalentSkillSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  if (!(await canModifyTalent(supabase, user.id, role, parsed.data.talent_id))) {
    return { data: null, error: "このタレントを編集する権限がありません" };
  }

  const { data, error } = await supabase
    .from("talent_skills")
    .insert({ ...parsed.data, created_by: user.id })
    .select()
    .single();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  return { data, error: null };
}

// ---------- スキル更新 ----------
export async function updateTalentSkill(
  id: string,
  // expected_updated_at はスキーマの外。楽観ロックにだけ使う（T-0096）
  input: z.infer<typeof updateTalentSkillSchema> & { expected_updated_at?: string }
): Promise<ActionResult<Row<"talent_skills">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  if (!UUID_REGEX.test(id)) return { data: null, error: "不正なパラメータです" };

  const parsed = updateTalentSkillSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const talentId = await getSkillTalentId(supabase, id);
  if (!talentId) return { data: null, error: "スキルが見つかりません" };
  if (!(await canModifyTalent(supabase, user.id, role, talentId))) {
    return { data: null, error: "このタレントを編集する権限がありません" };
  }

  /*
   * 楽観ロック（T-0096）。スキーマには無いので input から直接読む。
   * 渡されたときだけ条件に足す
   */
  const expectedUpdatedAt = (input as Record<string, unknown>).expected_updated_at;

  let query = supabase
    .from("talent_skills")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("id", id);
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await query.select().maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  if (!data) return { data: null, error: conflictErrorMessage("このスキル") };
  return { data, error: null };
}

// ---------- スキル削除 ----------
export async function removeTalentSkill(id: string): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  if (!UUID_REGEX.test(id)) return { data: null, error: "不正なパラメータです" };

  const talentId = await getSkillTalentId(supabase, id);
  if (!talentId) return { data: null, error: "スキルが見つかりません" };
  if (!(await canModifyTalent(supabase, user.id, role, talentId))) {
    return { data: null, error: "このタレントを編集する権限がありません" };
  }

  const { error } = await supabase
    .from("talent_skills")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント", operation: "delete"}) };
  return { data: null, error: null };
}

// ---------- キャリア追加 ----------
export async function addTalentCareer(
  input: z.infer<typeof createTalentCareerSchema>
): Promise<ActionResult<Row<"talent_careers">>> {
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  return { data, error: null };
}

// ---------- キャリア更新 ----------
export async function updateTalentCareer(
  id: string,
  // expected_updated_at はスキーマの外。楽観ロックにだけ使う（T-0096）
  input: z.infer<typeof updateTalentCareerSchema> & { expected_updated_at?: string }
): Promise<ActionResult<Row<"talent_careers">>> {
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

  /*
   * 楽観ロック（T-0096）。スキーマには無いので input から直接読む。
   * 渡されたときだけ条件に足す
   */
  const expectedUpdatedAt = (input as Record<string, unknown>).expected_updated_at;

  let query = supabase
    .from("talent_careers")
    .update({ ...parsed.data, last_updated_by: user.id })
    .eq("id", id);
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await query.select().maybeSingle();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };
  if (!data) return { data: null, error: conflictErrorMessage("この経歴") };
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

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント", operation: "delete"}) };
  return { data: null, error: null };
}

// ---------- ポテンシャルタイプ一覧 ----------
/**
 * 絞り込みの選択肢に使うポテンシャルタイプ（IL+ / PR- など 12 種）。
 *
 * number_diagnosis は番号 1〜60 とタイプの対応表なので、タイプで畳んで返す。
 * 優位脳（左脳 / 右脳）を添えるのは、記号だけでは何を選んでいるか
 * 分からないため。
 */
export async function getPotentialTypes(): Promise<
  ActionResult<{ type: string; dominantBrain: string | null }[]>
> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("number_diagnosis")
    .select("type, dominant_brain")
    .order("type", { ascending: true });

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "タレント" }) };

  const seen = new Map<string, string | null>();
  for (const row of data ?? []) {
    if (!row.type || seen.has(row.type)) continue;
    seen.set(row.type, row.dominant_brain);
  }

  return {
    data: [...seen].map(([type, dominantBrain]) => ({ type, dominantBrain })),
    error: null,
  };
}

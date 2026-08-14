"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createPipelineTypeSchema, updatePipelineTypeSchema,
  createDealStageSchema, updateDealStageSchema,
  createDealStatusSchema, updateDealStatusSchema,
  createContractTypeSchema, updateContractTypeSchema,
  createCorporateTypeSchema, updateCorporateTypeSchema,
  createServiceSchema, updateServiceSchema,
  createLeadSourceSchema, updateLeadSourceSchema,
  createAccountTypeSchema, updateAccountTypeSchema,
  createAccountStatusSchema, updateAccountStatusSchema,
  createAccountRoleTypeSchema, updateAccountRoleTypeSchema,
  createContactStatusSchema, updateContactStatusSchema,
  createCompanyStatusSchema, updateCompanyStatusSchema,
  createSkillCategorySchema, updateSkillCategorySchema,
  createSkillSchema, updateSkillSchema,
  createProjectStatusSchema, updateProjectStatusSchema,
  leadCategoryCreateSchema, leadCategoryUpdateSchema,
  leadActivityTypeCreateSchema, leadActivityTypeUpdateSchema,
  leadStageCreateSchema, leadStageUpdateSchema,
  leadStatusCreateSchema, leadStatusUpdateSchema,
  leadTemperatureCreateSchema, leadTemperatureUpdateSchema,
  leadCallStatusCreateSchema, leadCallStatusUpdateSchema,
  leadLargeSegmentCreateSchema, leadLargeSegmentUpdateSchema,
  leadSmallSegmentCreateSchema, leadSmallSegmentUpdateSchema,
  leadCompanySizeSchema, leadCompanySizeUpdateSchema,
  leadCustomerActivityTypeSchema, leadCustomerActivityTypeUpdateSchema,
  leadScoreRuleSchema, leadScoreRuleUpdateSchema,
} from "@/lib/validators";
import { toUserMessage } from "@/lib/db-error";
import { conflictErrorMessage } from "@/lib/validators/common";
import { MASTER_LABELS } from "@/lib/master-labels";
import { pickDefaultBadgeColor } from "@/lib/master-color";
import type { z } from "zod";
import type { Database } from "@/types/database.generated";
import type {
  LeadScoreRuleWithRefCheck,
  NamedRef,
  Row,
} from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

/** 生成型から導出したテーブル名。存在しないテーブル名の指定をビルド時に検出する */
type MasterTableName = keyof Database["public"]["Tables"];

/**
 * 汎用マスタ CRUD 用に型を緩めたクライアント。
 *
 * 本ファイルの CRUD は実行時にテーブル名が決まる設計のため、Database 型のまま
 * `from(tableName)` に渡すと 70 以上のテーブルの Insert/Update 型がユニオンとして
 * 展開され、TS2589（Type instantiation is excessively deep）で型チェックが破綻する。
 *
 * テーブル名は `MasterTableName` で検証済みなので、クエリビルダに限り型を外す。
 * 個別エンティティの Server Action（deals.ts 等）では型付きクライアントを使うこと。
 */
type LooseSupabase = Omit<Awaited<ReturnType<typeof createClient>>, "from"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: MasterTableName | string) => any;
};

/**
 * 監査カラム（created_by / last_updated_by / deleted_by）を持つテーブルのセット。
 * 新マスタ追加時はマイグレーションで監査カラムを追加した場合のみここに追記する。
 * Lead 系の新マスタ（20260419以降）は監査カラム無しで作成されているため含まない。
 */
const TABLES_WITH_AUDIT_COLUMNS = new Set([
  // マスタ（20260416040001 + 20260418000009 で監査カラム追加済み）
  "pipeline_types",
  "contract_types",
  "corporate_types",
  "services",
  "lead_sources",
  "account_types",
  "account_statuses",
  "contact_statuses",
  "skill_categories",
  "skills",
  "company_statuses",
  "deal_stages",
  "deal_statuses",
  "industry_classifications",
  // project_statuses（20260418000011 で定義時から監査カラム付き）
  "project_statuses",
]);

/** テーブルが監査カラムを持つか判定 */
function hasAuditColumns(tableName: MasterTableName): boolean {
  return TABLES_WITH_AUDIT_COLUMNS.has(tableName);
}

/**
 * テーブル名 → 画面上の名称。DB エラーを日本語に直すときの主語に使う。
 * 画面のタブ名（TAB_LABELS）と同じ言葉にすること。
 */

function masterLabel(tableName: MasterTableName): string {
  return MASTER_LABELS[tableName] ?? "マスタ";
}

/**
 * `color` カラムを持つマスタ。
 *
 * 未指定で保存された行に色を自動付与する対象。存在しないカラムへ
 * 書こうとすると INSERT 全体が落ちるため、リストで明示する
 * （information_schema を毎回引くのは取得の往復が増えて割に合わない）。
 * color を持つテーブルを増やしたらここにも足すこと。
 */
const COLOR_MASTER_TABLES = new Set<string>([
  "account_role_types",
  "account_statuses",
  "company_statuses",
  "contact_statuses",
  "deal_stages",
  "deal_statuses",
  "lead_activity_types",
  "lead_call_statuses",
  "lead_categories",
  "lead_customer_activity_types",
  "lead_stages",
  "lead_statuses",
  "lead_temperatures",
  "project_statuses",
  // social_services も color を持つが、この汎用 CRUD の対象外
  // （論理削除カラムが無く一覧取得の条件が合わない）
]);

/**
 * 色が未指定なら、同じマスタで使われていない色を割り当てて返す。
 *
 * 表示側にも「色が無ければ名前から選ぶ」フォールバックはあるが、それだと
 * DB に色が入らないままなので、同じ値でも一覧と詳細で違う色に見えうる。
 * バッジ色の正本は DB という規約（CLAUDE.md）に合わせ、保存時に確定させる。
 */
async function withDefaultColor(
  supabase: LooseSupabase,
  tableName: MasterTableName,
  values: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!COLOR_MASTER_TABLES.has(tableName)) return values;
  if (!("color" in values)) return values;
  if (typeof values.color === "string" && values.color.trim() !== "") return values;

  const { data } = await supabase
    .from(tableName)
    .select("color")
    .is("deleted_at", null);

  const existing = ((data ?? []) as { color?: string | null }[]).map((r) => r.color);
  const seed =
    (typeof values.name === "string" && values.name) ||
    (typeof values.code === "string" && values.code) ||
    tableName;

  return { ...values, color: pickDefaultBadgeColor(existing, seed) };
}

async function getAuthenticatedUser() {
  const typed = await createClient();
  const { data: { user } } = await typed.auth.getUser();
  if (!user) return { supabase: null, user: null };
  // 汎用 CRUD のため型を緩める（理由は LooseSupabase の説明を参照）
  return { supabase: typed as unknown as LooseSupabase, user };
}

async function getUserRole(supabase: LooseSupabase, userId: string): Promise<string | null> {
  const { data } = await supabase.from("crm_users").select("role").eq("id", userId).single();
  return data?.role ?? null;
}

async function requireAdmin(supabase: LooseSupabase, userId: string): Promise<string | null> {
  const role = await getUserRole(supabase, userId);
  if (role !== "admin") return "管理者権限が必要です";
  return null;
}

// 汎用: マスタ一覧取得（認証済みユーザー全員）
// sort_order カラムを持つテーブル（pipeline_types / skill_categories / skills など）は
// { useSortOrder: true } を指定する。未指定なら name と created_at で並べる。
export async function getMasterList<K extends MasterTableName>(
  tableName: K,
  options?: { useSortOrder?: boolean },
): Promise<ActionResult<Row<K>[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  let query = supabase.from(tableName).select("*").is("deleted_at", null);
  if (options?.useSortOrder) {
    query = query.order("sort_order", { ascending: true });
  }
  query = query
    .order("name", { ascending: true })
    .order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}

// 汎用: マスタ作成（admin のみ）
export async function createMasterRecord<K extends MasterTableName>(
  tableName: K,
  input: Record<string, unknown>,
  schema: z.ZodSchema
): Promise<ActionResult<Row<K>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const auditCreate = hasAuditColumns(tableName) ? { created_by: user.id } : {};
  const withColor = await withDefaultColor(
    supabase,
    tableName,
    parsed.data as Record<string, unknown>
  );
  const { data, error } = await supabase.from(tableName).insert({ ...withColor, ...auditCreate }).select().single();
  if (error) {
    return {
      data: null,
      error: toUserMessage(error, { entityLabel: masterLabel(tableName), operation: "create" }),
    };
  }
  return { data, error: null };
}

// 汎用: マスタ更新（admin のみ）
export async function updateMasterRecord<K extends MasterTableName>(
  tableName: K,
  id: string,
  input: Record<string, unknown>,
  schema: z.ZodSchema
): Promise<ActionResult<Row<K>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };

  /*
   * 楽観ロック（T-0096）。
   * **マスタは複数の admin が同じ画面を開くので後勝ちが起きやすい。**
   * `expected_updated_at` は各マスタの Zod スキーマには無いので、
   * 検証にかける前にここで取り除く。
   * 監査カラムを持たない古い Lead 系マスタには `updated_at` が無く、
   * 画面からも渡されない。**渡されたときだけ**条件に足す
   */
  const { expected_updated_at: expectedUpdatedAt, ...values } = input;

  const parsed = schema.safeParse(values);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const auditUpdate = hasAuditColumns(tableName) ? { last_updated_by: user.id } : {};
  // 色を空にして保存した場合も未指定として扱い、付け直す。
  // 色の無い行を作らないため（色欄を触っていない更新では values に color が無く、素通りする）
  const withColor = await withDefaultColor(
    supabase,
    tableName,
    parsed.data as Record<string, unknown>
  );
  let query = supabase
    .from(tableName)
    .update({ ...withColor, ...auditUpdate })
    .eq("id", id);
  if (typeof expectedUpdatedAt === "string" && expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await query.select().maybeSingle();
  if (error) {
    return {
      data: null,
      error: toUserMessage(error, { entityLabel: masterLabel(tableName), operation: "update" }),
    };
  }
  // 0 行更新は「他の人が先に保存した」。行が消えている場合も同じ案内でよい
  if (!data) {
    return { data: null, error: conflictErrorMessage(masterLabel(tableName)) };
  }
  return { data, error: null };
}

// 汎用: マスタ論理削除（admin のみ）
export async function deleteMasterRecord(tableName: MasterTableName, id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };

  const auditDelete = hasAuditColumns(tableName) ? { last_updated_by: user.id } : {};
  const { error } = await supabase.from(tableName).update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
    ...auditDelete,
  }).eq("id", id);
  if (error) {
    return {
      data: null,
      error: toUserMessage(error, { entityLabel: masterLabel(tableName), operation: "delete" }),
    };
  }
  return { data: null, error: null };
}

// ===== 具体的な関数（型安全なラッパー） =====

// Pipeline Types
export async function getPipelineTypes() { return getMasterList("pipeline_types", { useSortOrder: true }); }
export async function createPipelineType(input: Record<string, unknown>) {
  return createMasterRecord("pipeline_types", input, createPipelineTypeSchema);
}
export async function updatePipelineType(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("pipeline_types", id, input, updatePipelineTypeSchema);
}
export async function deletePipelineType(id: string) { return deleteMasterRecord("pipeline_types", id); }

// Deal Stages
export async function getDealStages(
  pipelineTypeId?: string
): Promise<ActionResult<Row<"deal_stages">[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  let query = supabase.from("deal_stages").select("*").is("deleted_at", null).order("sort_order");
  if (pipelineTypeId) query = query.eq("pipeline_type_id", pipelineTypeId);
  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function createDealStage(input: Record<string, unknown>) {
  return createMasterRecord("deal_stages", input, createDealStageSchema);
}
export async function updateDealStage(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("deal_stages", id, input, updateDealStageSchema);
}
export async function deleteDealStage(id: string) { return deleteMasterRecord("deal_stages", id); }

// Deal Statuses
export async function getDealStatuses(
  pipelineTypeId?: string,
  dealStageId?: string
): Promise<ActionResult<Row<"deal_statuses">[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  let query = supabase.from("deal_statuses").select("*").is("deleted_at", null).order("sort_order");
  if (pipelineTypeId) query = query.eq("pipeline_type_id", pipelineTypeId);
  if (dealStageId) query = query.eq("deal_stage_id", dealStageId);
  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function createDealStatus(input: Record<string, unknown>) {
  return createMasterRecord("deal_statuses", input, createDealStatusSchema);
}
export async function updateDealStatus(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("deal_statuses", id, input, updateDealStatusSchema);
}
export async function deleteDealStatus(id: string) { return deleteMasterRecord("deal_statuses", id); }

// Contract Types
export async function getContractTypes() { return getMasterList("contract_types"); }
export async function createContractTypeAction(input: Record<string, unknown>) {
  return createMasterRecord("contract_types", input, createContractTypeSchema);
}
export async function updateContractType(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("contract_types", id, input, updateContractTypeSchema);
}
export async function deleteContractType(id: string) { return deleteMasterRecord("contract_types", id); }

// Corporate Types
export async function getCorporateTypes() { return getMasterList("corporate_types"); }
export async function createCorporateType(input: Record<string, unknown>) {
  return createMasterRecord("corporate_types", input, createCorporateTypeSchema);
}
export async function updateCorporateType(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("corporate_types", id, input, updateCorporateTypeSchema);
}
export async function deleteCorporateType(id: string) { return deleteMasterRecord("corporate_types", id); }

// Services
export async function getServices() { return getMasterList("services"); }
export async function createService(input: Record<string, unknown>) {
  return createMasterRecord("services", input, createServiceSchema);
}
export async function updateService(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("services", id, input, updateServiceSchema);
}
export async function deleteService(id: string) { return deleteMasterRecord("services", id); }

// Lead Sources
export async function getLeadSources() { return getMasterList("lead_sources"); }
export async function createLeadSource(input: Record<string, unknown>) {
  return createMasterRecord("lead_sources", input, createLeadSourceSchema);
}
export async function updateLeadSource(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("lead_sources", id, input, updateLeadSourceSchema);
}
export async function deleteLeadSource(id: string) { return deleteMasterRecord("lead_sources", id); }

// Account Types
export async function getAccountTypes() { return getMasterList("account_types"); }
export async function createAccountTypeAction(input: Record<string, unknown>) {
  return createMasterRecord("account_types", input, createAccountTypeSchema);
}
export async function updateAccountType(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("account_types", id, input, updateAccountTypeSchema);
}
export async function deleteAccountType(id: string) { return deleteMasterRecord("account_types", id); }

// Account Statuses
export async function getAccountStatuses() { return getMasterList("account_statuses"); }
export async function createAccountStatusAction(input: Record<string, unknown>) {
  return createMasterRecord("account_statuses", input, createAccountStatusSchema);
}
export async function updateAccountStatus(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("account_statuses", id, input, updateAccountStatusSchema);
}
export async function deleteAccountStatus(id: string) { return deleteMasterRecord("account_statuses", id); }

// Contact Statuses
export async function getContactStatuses() { return getMasterList("contact_statuses"); }
export async function createContactStatusAction(input: Record<string, unknown>) {
  return createMasterRecord("contact_statuses", input, createContactStatusSchema);
}
export async function updateContactStatus(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("contact_statuses", id, input, updateContactStatusSchema);
}
export async function deleteContactStatus(id: string) { return deleteMasterRecord("contact_statuses", id); }

// Company Statuses
export async function getCompanyStatuses() { return getMasterList("company_statuses"); }
export async function createCompanyStatusAction(input: Record<string, unknown>) {
  return createMasterRecord("company_statuses", input, createCompanyStatusSchema);
}
export async function updateCompanyStatus(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("company_statuses", id, input, updateCompanyStatusSchema);
}
export async function deleteCompanyStatus(id: string) { return deleteMasterRecord("company_statuses", id); }

// Project Statuses
export async function getProjectStatusesMasters() { return getMasterList("project_statuses", { useSortOrder: true }); }
export async function createProjectStatus(input: Record<string, unknown>) {
  return createMasterRecord("project_statuses", input, createProjectStatusSchema);
}
export async function updateProjectStatus(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("project_statuses", id, input, updateProjectStatusSchema);
}
export async function deleteProjectStatus(id: string) { return deleteMasterRecord("project_statuses", id); }

// Skill Categories
export async function getSkillCategories() { return getMasterList("skill_categories", { useSortOrder: true }); }
export async function createSkillCategory(input: Record<string, unknown>) {
  return createMasterRecord("skill_categories", input, createSkillCategorySchema);
}
export async function updateSkillCategory(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("skill_categories", id, input, updateSkillCategorySchema);
}
export async function deleteSkillCategory(id: string) { return deleteMasterRecord("skill_categories", id); }

// Skills
export async function getSkills(categoryId?: string) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  let query = supabase.from("skills").select("id, skill_code, skill_category_id, axis, name, system_tags, note, sort_order, is_active, skill_categories(name)").is("deleted_at", null).order("sort_order");
  if (categoryId) query = query.eq("skill_category_id", categoryId);
  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function createSkill(input: Record<string, unknown>) {
  return createMasterRecord("skills", input, createSkillSchema);
}
export async function updateSkill(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("skills", id, input, updateSkillSchema);
}
export async function deleteSkill(id: string) { return deleteMasterRecord("skills", id); }

// Lead Categories
// ※ lead_categories は created_by / last_updated_by カラムを持たないため専用実装
export async function getLeadCategories() { return getMasterList("lead_categories", { useSortOrder: true }); }
export async function createLeadCategory(input: Record<string, unknown>): Promise<ActionResult<Row<"lead_categories">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadCategoryCreateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_categories").insert(parsed.data as Record<string, unknown>).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function updateLeadCategory(id: string, input: Record<string, unknown>): Promise<ActionResult<Row<"lead_categories">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadCategoryUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_categories").update(parsed.data as Record<string, unknown>).eq("id", id).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function deleteLeadCategory(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const { error } = await supabase.from("lead_categories").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ", operation: "delete"}) };
  return { data: null, error: null };
}

// Lead Stages
export async function getLeadStages() { return getMasterList("lead_stages", { useSortOrder: true }); }

// Lead Statuses（stage_id でフィルタ可能）
export async function getLeadStatuses(
  stageId?: string
): Promise<ActionResult<(Row<"lead_statuses"> & { stage: NamedRef | null })[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  let query = supabase
    .from("lead_statuses")
    .select("*, stage:lead_stages(id, name)")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (stageId) query = query.eq("stage_id", stageId);
  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}

// Lead Temperatures
export async function getLeadTemperatures() { return getMasterList("lead_temperatures", { useSortOrder: true }); }

// Lead Call Statuses
export async function getLeadCallStatuses() { return getMasterList("lead_call_statuses", { useSortOrder: true }); }

// Lead Large Segments
export async function getLeadLargeSegments() { return getMasterList("lead_large_segments"); }

// Lead Small Segments（large_segment_id でフィルタ可能）
export async function getLeadSmallSegments(
  largeSegmentId?: string
): Promise<ActionResult<Row<"lead_small_segments">[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  let query = supabase
    .from("lead_small_segments")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (largeSegmentId) query = query.eq("large_segment_id", largeSegmentId);
  const { data, error } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}

// Lead Activity Types
// ※ lead_activity_types は created_by / last_updated_by カラムを持たないため専用実装
export async function getLeadActivityTypes() { return getMasterList("lead_activity_types", { useSortOrder: true }); }
export async function createLeadActivityType(input: Record<string, unknown>): Promise<ActionResult<Row<"lead_activity_types">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadActivityTypeCreateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_activity_types").insert(parsed.data as Record<string, unknown>).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function updateLeadActivityType(id: string, input: Record<string, unknown>): Promise<ActionResult<Row<"lead_activity_types">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadActivityTypeUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_activity_types").update(parsed.data as Record<string, unknown>).eq("id", id).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function deleteLeadActivityType(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const { error } = await supabase.from("lead_activity_types").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ", operation: "delete"}) };
  return { data: null, error: null };
}

// Lead Stages CRUD
export async function createLeadStage(input: Record<string, unknown>) {
  return createMasterRecord("lead_stages", input, leadStageCreateSchema);
}
export async function updateLeadStage(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("lead_stages", id, input, leadStageUpdateSchema);
}
export async function deleteLeadStage(id: string) { return deleteMasterRecord("lead_stages", id); }

// Lead Statuses CRUD
export async function createLeadStatus(input: Record<string, unknown>) {
  return createMasterRecord("lead_statuses", input, leadStatusCreateSchema);
}
export async function updateLeadStatus(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("lead_statuses", id, input, leadStatusUpdateSchema);
}
export async function deleteLeadStatus(id: string) { return deleteMasterRecord("lead_statuses", id); }

// Lead Temperatures CRUD
export async function createLeadTemperature(input: Record<string, unknown>) {
  return createMasterRecord("lead_temperatures", input, leadTemperatureCreateSchema);
}
export async function updateLeadTemperature(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("lead_temperatures", id, input, leadTemperatureUpdateSchema);
}
export async function deleteLeadTemperature(id: string) { return deleteMasterRecord("lead_temperatures", id); }

// Lead Call Statuses CRUD
export async function createLeadCallStatus(input: Record<string, unknown>) {
  return createMasterRecord("lead_call_statuses", input, leadCallStatusCreateSchema);
}
export async function updateLeadCallStatus(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("lead_call_statuses", id, input, leadCallStatusUpdateSchema);
}
export async function deleteLeadCallStatus(id: string) { return deleteMasterRecord("lead_call_statuses", id); }

// Lead Large Segments CRUD
export async function createLeadLargeSegment(input: Record<string, unknown>) {
  return createMasterRecord("lead_large_segments", input, leadLargeSegmentCreateSchema);
}
export async function updateLeadLargeSegment(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("lead_large_segments", id, input, leadLargeSegmentUpdateSchema);
}
export async function deleteLeadLargeSegment(id: string) { return deleteMasterRecord("lead_large_segments", id); }

// Lead Small Segments CRUD
export async function createLeadSmallSegment(input: Record<string, unknown>) {
  return createMasterRecord("lead_small_segments", input, leadSmallSegmentCreateSchema);
}
export async function updateLeadSmallSegment(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("lead_small_segments", id, input, leadSmallSegmentUpdateSchema);
}
export async function deleteLeadSmallSegment(id: string) { return deleteMasterRecord("lead_small_segments", id); }

// ============================================================
// Phase 7: 新マスタ CRUD（lead_company_sizes / lead_customer_activity_types / lead_score_rules）
// ============================================================

// Lead Company Sizes（M24）
export async function getLeadCompanySizes(): Promise<ActionResult<Row<"lead_company_sizes">[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const { data, error } = await supabase
    .from("lead_company_sizes")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function createLeadCompanySize(input: Record<string, unknown>): Promise<ActionResult<Row<"lead_company_sizes">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadCompanySizeSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_company_sizes").insert(parsed.data as Record<string, unknown>).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function updateLeadCompanySize(id: string, input: Record<string, unknown>): Promise<ActionResult<Row<"lead_company_sizes">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadCompanySizeUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_company_sizes").update(parsed.data as Record<string, unknown>).eq("id", id).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function deleteLeadCompanySize(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const { error } = await supabase.from("lead_company_sizes").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ", operation: "delete"}) };
  return { data: null, error: null };
}

// Lead Customer Activity Types（M25）
export async function getLeadCustomerActivityTypes(): Promise<ActionResult<Row<"lead_customer_activity_types">[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const { data, error } = await supabase
    .from("lead_customer_activity_types")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function createLeadCustomerActivityType(input: Record<string, unknown>): Promise<ActionResult<Row<"lead_customer_activity_types">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadCustomerActivityTypeSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_customer_activity_types").insert(parsed.data as Record<string, unknown>).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function updateLeadCustomerActivityType(id: string, input: Record<string, unknown>): Promise<ActionResult<Row<"lead_customer_activity_types">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadCustomerActivityTypeUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_customer_activity_types").update(parsed.data as Record<string, unknown>).eq("id", id).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function deleteLeadCustomerActivityType(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const { error } = await supabase.from("lead_customer_activity_types").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ", operation: "delete"}) };
  return { data: null, error: null };
}

// Lead Score Rules（M26）
export async function getLeadScoreRules(): Promise<ActionResult<Row<"lead_score_rules">[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const { data, error } = await supabase
    .from("lead_score_rules")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function createLeadScoreRule(input: Record<string, unknown>): Promise<ActionResult<Row<"lead_score_rules">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadScoreRuleSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_score_rules").insert(parsed.data as Record<string, unknown>).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function updateLeadScoreRule(id: string, input: Record<string, unknown>): Promise<ActionResult<Row<"lead_score_rules">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const parsed = leadScoreRuleUpdateSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };
  const { data, error } = await supabase.from("lead_score_rules").update(parsed.data as Record<string, unknown>).eq("id", id).select().single();
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}
export async function deleteLeadScoreRule(id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };
  const { error } = await supabase.from("lead_score_rules").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ", operation: "delete"}) };
  return { data: null, error: null };
}

// Lead Score Thresholds（旧 lead_scoring_rules）取得 + CRUD
export async function getLeadScoreThresholds(): Promise<ActionResult<Row<"lead_score_thresholds">[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  const { data, error } = await supabase
    .from("lead_score_thresholds")
    .select("*")
    .is("deleted_at", null)
    .order("min_score", { ascending: true });
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  return { data, error: null };
}

// 参照切れルール確認（admin 向け）
// lead_score_rules.condition_value_id の参照先マスタ行が存在するかチェック
export async function getLeadScoreRulesWithBrokenRefs(): Promise<ActionResult<{
  rules: LeadScoreRuleWithRefCheck[];
  brokenCount: number;
}>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // ルール一覧取得
  const { data: rules, error } = await supabase
    .from("lead_score_rules")
    .select("*")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "マスタ" }) };
  if (!rules || rules.length === 0) return { data: { rules: [], brokenCount: 0 }, error: null };

  // condition_value_id を持つルールについて参照先を検証
  // condition_type ごとにテーブルを解決
  const TABLE_MAP: Record<string, string> = {
    company_size: "lead_company_sizes",
    large_segment: "lead_large_segments",
    small_segment: "lead_small_segments",
    lead_source: "lead_sources",
    stage: "lead_stages",
    status: "lead_statuses",
    call_status: "lead_call_statuses",
    activity_type: "lead_activity_types",
    customer_activity_type: "lead_customer_activity_types",
  };

  const rulesWithRef = await Promise.all(
    (rules as Database["public"]["Tables"]["lead_score_rules"]["Row"][]).map(async (rule) => {
      if (!rule.condition_value_id) return { ...rule, _refBroken: false };
      const tableName = TABLE_MAP[rule.condition_type];
      if (!tableName) return { ...rule, _refBroken: false };
      const { data: refRow } = await supabase
        .from(tableName)
        .select("id, deleted_at")
        .eq("id", rule.condition_value_id)
        .maybeSingle();
      const broken = !refRow || refRow.deleted_at != null;
      return { ...rule, _refBroken: broken };
    })
  );

  const brokenCount = rulesWithRef.filter((r) => r._refBroken).length;
  return { data: { rules: rulesWithRef, brokenCount }, error: null };
}

// --- account_role_types（取引先区分）---
export async function getAccountRoleTypesMaster() {
  return getMasterList("account_role_types", { useSortOrder: true });
}
export async function createAccountRoleType(input: Record<string, unknown>) {
  return createMasterRecord("account_role_types", input, createAccountRoleTypeSchema);
}
export async function updateAccountRoleType(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("account_role_types", id, input, updateAccountRoleTypeSchema);
}
export async function deleteAccountRoleType(id: string) {
  return deleteMasterRecord("account_role_types", id);
}

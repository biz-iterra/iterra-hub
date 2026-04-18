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
  createContactStatusSchema, updateContactStatusSchema,
  createCompanyStatusSchema, updateCompanyStatusSchema,
  createSkillCategorySchema, updateSkillCategorySchema,
  createSkillSchema, updateSkillSchema,
  createProjectStatusSchema, updateProjectStatusSchema,
} from "@/lib/validators";
import type { z } from "zod";

type ActionResult<T> = { data: T | null; error: string | null };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null };
  return { supabase, user };
}

async function getUserRole(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase.from("crm_users").select("role").eq("id", userId).single();
  return data?.role ?? null;
}

async function requireAdmin(supabase: any, userId: string): Promise<string | null> {
  const role = await getUserRole(supabase, userId);
  if (role !== "admin") return "管理者権限が必要です";
  return null;
}

// 汎用: マスタ一覧取得（認証済みユーザー全員）
// sort_order カラムを持つテーブル（pipeline_types / skill_categories / skills など）は
// { useSortOrder: true } を指定する。未指定なら name と created_at で並べる。
export async function getMasterList(
  tableName: string,
  options?: { useSortOrder?: boolean },
): Promise<ActionResult<any[]>> {
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
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 汎用: マスタ作成（admin のみ）
export async function createMasterRecord(
  tableName: string,
  input: Record<string, unknown>,
  schema: z.ZodSchema
): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase.from(tableName).insert({ ...(parsed.data as Record<string, unknown>), created_by: user.id }).select().single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 汎用: マスタ更新（admin のみ）
export async function updateMasterRecord(
  tableName: string,
  id: string,
  input: Record<string, unknown>,
  schema: z.ZodSchema
): Promise<ActionResult<any>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0].message };

  const { data, error } = await supabase.from(tableName).update({ ...(parsed.data as Record<string, unknown>), last_updated_by: user.id }).eq("id", id).select().single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// 汎用: マスタ論理削除（admin のみ）
export async function deleteMasterRecord(tableName: string, id: string): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const adminError = await requireAdmin(supabase, user.id);
  if (adminError) return { data: null, error: adminError };

  const { error } = await supabase.from(tableName).update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
    last_updated_by: user.id,
  }).eq("id", id);
  if (error) return { data: null, error: error.message };
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
export async function getDealStages(pipelineTypeId?: string) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  let query = supabase.from("deal_stages").select("*").is("deleted_at", null).order("sort_order");
  if (pipelineTypeId) query = query.eq("pipeline_type_id", pipelineTypeId);
  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
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
export async function getDealStatuses(pipelineTypeId?: string, dealStageId?: string) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  let query = supabase.from("deal_statuses").select("*").is("deleted_at", null).order("sort_order");
  if (pipelineTypeId) query = query.eq("pipeline_type_id", pipelineTypeId);
  if (dealStageId) query = query.eq("deal_stage_id", dealStageId);
  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
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
  let query = supabase.from("skills").select("*, skill_categories(name)").is("deleted_at", null).order("sort_order");
  if (categoryId) query = query.eq("skill_category_id", categoryId);
  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}
export async function createSkill(input: Record<string, unknown>) {
  return createMasterRecord("skills", input, createSkillSchema);
}
export async function updateSkill(id: string, input: Record<string, unknown>) {
  return updateMasterRecord("skills", id, input, updateSkillSchema);
}
export async function deleteSkill(id: string) { return deleteMasterRecord("skills", id); }

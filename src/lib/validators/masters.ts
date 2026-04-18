import { z } from "zod";
import { uuidString } from "./common";

// --- M01: pipeline_types ---
export const createPipelineTypeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updatePipelineTypeSchema = createPipelineTypeSchema.partial();

// --- M02: contract_types ---
export const createContractTypeSchema = z.object({
  name: z.string().min(1).max(100),
});
export const updateContractTypeSchema = createContractTypeSchema.partial();

// --- M03: corporate_types ---
export const createCorporateTypeSchema = z.object({
  name: z.string().min(1).max(50),
});
export const updateCorporateTypeSchema = createCorporateTypeSchema.partial();

// --- M04: services ---
export const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
});
export const updateServiceSchema = createServiceSchema.partial();

// --- M05: lead_sources ---
export const createLeadSourceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
});
export const updateLeadSourceSchema = createLeadSourceSchema.partial();

// --- M06: account_types ---
export const createAccountTypeSchema = z.object({
  name: z.string().min(1).max(50),
});
export const updateAccountTypeSchema = createAccountTypeSchema.partial();

// --- M07: account_statuses ---
export const createAccountStatusSchema = z.object({
  name: z.string().min(1).max(50),
});
export const updateAccountStatusSchema = createAccountStatusSchema.partial();

// --- M08: contact_statuses ---
export const createContactStatusSchema = z.object({
  name: z.string().min(1).max(50),
});
export const updateContactStatusSchema = createContactStatusSchema.partial();

// --- M11: company_statuses ---
export const createCompanyStatusSchema = z.object({
  name: z.string().min(1).max(50),
});
export const updateCompanyStatusSchema = createCompanyStatusSchema.partial();

// --- M09: skill_categories ---
export const createSkillCategorySchema = z.object({
  name: z.string().min(1).max(50),
  sort_order: z.number().int().min(0).default(0),
});
export const updateSkillCategorySchema = createSkillCategorySchema.partial();

// --- M10: skills ---
export const createSkillSchema = z.object({
  skill_category_id: uuidString(),
  name: z.string().min(1).max(100),
  sort_order: z.number().int().min(0).default(0),
});
export const updateSkillSchema = createSkillSchema.partial();

// --- S01: deal_stages ---
export const createDealStageSchema = z.object({
  pipeline_type_id: uuidString(),
  name: z.string().min(1).max(100),
  current_situation: z.string().max(500).nullable().optional(),
  required_action: z.string().max(500).nullable().optional(),
  customer_situation: z.string().max(500).nullable().optional(),
  transition_condition: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updateDealStageSchema = createDealStageSchema.partial();

// --- S02: deal_statuses ---
export const createDealStatusSchema = z.object({
  name: z.string().min(1).max(100),
  pipeline_type_id: uuidString(),
  deal_stage_id: uuidString().nullable().optional(),
  sort_order: z.number().int().min(0).default(0),
});
export const updateDealStatusSchema = createDealStatusSchema.partial();

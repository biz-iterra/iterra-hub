import { z } from "zod";
import { uuidString } from "./common";

export const createTalentSchema = z.object({
  contact_id: uuidString("コンタクトは必須です"),
  personality_memo: z.string().max(5000).nullable().optional(),
  custom_strengths: z.string().max(2000).nullable().optional(),
  custom_weaknesses: z.string().max(2000).nullable().optional(),
  aptitude_notes: z.string().max(2000).nullable().optional(),
  overall_assessment: z.string().max(3000).nullable().optional(),
});

export const updateTalentSchema = createTalentSchema.omit({ contact_id: true }).partial();

// talent_skills
export const createTalentSkillSchema = z.object({
  talent_id: uuidString(),
  skill_id: uuidString(),
  proficiency_level: z.number().int().min(1).max(5).default(1),
  years_experience: z.number().int().min(0).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const updateTalentSkillSchema = createTalentSkillSchema.omit({ talent_id: true, skill_id: true }).partial();

// talent_careers
const talentCareerBaseSchema = z.object({
  talent_id: uuidString(),
  career_type: z.enum(["work", "education", "certification"]),
  organization: z.string().min(1, "組織名は必須です").max(200),
  title: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  is_current: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

export const createTalentCareerSchema = talentCareerBaseSchema.refine(
  (data) => !data.start_date || !data.end_date || data.end_date >= data.start_date,
  { message: "終了日は開始日以降にしてください", path: ["end_date"] }
).refine(
  (data) => !data.is_current || !data.end_date,
  { message: "現在進行中の場合、終了日は設定できません", path: ["end_date"] }
);

export const updateTalentCareerSchema = talentCareerBaseSchema.omit({ talent_id: true }).partial();

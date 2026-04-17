import { z } from "zod";

export const createAccountSchema = z.object({
  name: z.string().min(1, "アカウント名は必須です").max(200),
  company_id: z.string().uuid().nullable().optional(),
  account_type_id: z.string().uuid().nullable().optional(),
  account_status_id: z.string().uuid("ステータスは必須です"),
  description: z.string().max(1000).nullable().optional(),
  lead_source_id: z.string().uuid().nullable().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
});

export const updateAccountSchema = createAccountSchema.partial();

// account_contacts
export const createAccountContactSchema = z.object({
  account_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  role: z.enum(["primary", "billing", "technical", "other"]).nullable().optional(),
});

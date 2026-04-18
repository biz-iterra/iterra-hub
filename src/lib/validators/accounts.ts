import { z } from "zod";
import { uuidString } from "./common";

export const createAccountSchema = z.object({
  name: z.string().min(1, "アカウント名は必須です").max(200),
  company_id: uuidString().nullable().optional(),
  account_type_id: uuidString().nullable().optional(),
  account_status_id: uuidString("ステータスは必須です"),
  description: z.string().max(1000).nullable().optional(),
  lead_source_id: uuidString().nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
});

export const updateAccountSchema = createAccountSchema.partial();

// account_contacts
export const createAccountContactSchema = z.object({
  account_id: uuidString(),
  contact_id: uuidString(),
  role: z.enum(["primary", "billing", "technical", "other"]).nullable().optional(),
});

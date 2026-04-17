import { z } from "zod";

// deal_activities
export const createDealActivitySchema = z.object({
  deal_id: z.string().uuid(),
  activity_type: z.enum(["email", "call", "meeting", "visit", "other"]),
  activity_at: z.string(), // ISO datetime
  contact_id: z.string().uuid().nullable().optional(),
  subject: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  duration_minutes: z.number().int().min(0).nullable().optional(),
});

export const updateDealActivitySchema = createDealActivitySchema.omit({ deal_id: true }).partial();

// deal_activity_emails
export const createDealActivityEmailSchema = z.object({
  deal_activity_id: z.string().uuid(),
  sender_name: z.string().max(100).nullable().optional(),
  sender_email: z.string().email().nullable().optional(),
  recipient_email: z.string().email().nullable().optional(),
  body: z.string().nullable().optional(),
  summary: z.string().max(2000).nullable().optional(),
});

// activity_logs
export const createActivityLogSchema = z.object({
  activity_type: z.enum(["note", "task", "other"]),
  subject: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
}).refine(
  (data) => !!(data.deal_id || data.contact_id || data.account_id || data.company_id),
  { message: "少なくとも1つの紐づけ先が必要です" }
);

import { z } from "zod";
import { uuidString } from "./common";

// deal_activities
export const createDealActivitySchema = z.object({
  deal_id: uuidString(),
  activity_type: z.enum(["email", "call", "meeting", "visit", "other"]),
  activity_at: z.string(), // ISO datetime
  contact_id: uuidString().nullable().optional(),
  subject: z.string().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  duration_minutes: z.number().int().min(0).nullable().optional(),
});

export const updateDealActivitySchema = createDealActivitySchema.omit({ deal_id: true }).partial();

// deal_activity_emails
export const createDealActivityEmailSchema = z.object({
  deal_activity_id: uuidString(),
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
  deal_id: uuidString().nullable().optional(),
  contact_id: uuidString().nullable().optional(),
  account_id: uuidString().nullable().optional(),
  company_id: uuidString().nullable().optional(),
}).refine(
  (data) => !!(data.deal_id || data.contact_id || data.account_id || data.company_id),
  { message: "少なくとも1つの紐づけ先が必要です" }
);

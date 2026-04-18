import { z } from "zod";
import { uuidString } from "./common";

const contactBaseSchema = z.object({
  last_name: z.string().min(1, "姓は必須です").max(50),
  middle_name: z.string().max(50).nullable().optional(),
  first_name: z.string().min(1, "名は必須です").max(50),
  last_name_kana: z.string().max(50).nullable().optional(),
  middle_name_kana: z.string().max(50).nullable().optional(),
  first_name_kana: z.string().max(50).nullable().optional(),
  contact_status_id: uuidString("ステータスは必須です"),
  contact_type: z.enum(["individual", "corporate_rep", "employee", "other"]).nullable().optional(),
  company_id: uuidString().nullable().optional(),
  invoice_registered: z.boolean().default(false),
  invoice_registration_number: z.string().regex(/^T\d{13}$/).nullable().optional(),
  postal_code: z.string().regex(/^\d{3}-\d{4}$/).nullable().optional(),
  prefecture: z.string().nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  address_line1: z.string().max(200).nullable().optional(),
  address_line2: z.string().max(200).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  job_title: z.string().max(100).nullable().optional(),
  birth_date: z.string().nullable().optional(), // ISO date string
  blood_type: z.enum(["A", "B", "AB", "O"]).nullable().optional(),
  potential_number: z.number().int().min(1).max(60).nullable().optional(),
  constellation_id: uuidString().nullable().optional(),
  lead_source_id: uuidString().nullable().optional(),
  line_user_id: z.string().nullable().optional(),
  internal_memo: z.string().max(2000).nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
});

export const createContactSchema = contactBaseSchema.refine(
  (data) => !data.invoice_registered || !!data.invoice_registration_number,
  { message: "インボイス登録ありの場合、登録番号は必須です", path: ["invoice_registration_number"] }
);

export const updateContactSchema = contactBaseSchema.partial();

// contact_emails
export const createContactEmailSchema = z.object({
  contact_id: uuidString(),
  email: z.string().email("有効なメールアドレスを入力してください"),
  label: z.enum(["work", "personal", "other"]).default("work"),
  is_primary: z.boolean().default(false),
});

// contact_phones
export const createContactPhoneSchema = z.object({
  contact_id: uuidString(),
  phone: z.string().min(1, "電話番号は必須です").max(20),
  label: z.enum(["work", "mobile", "home", "fax", "other"]).default("work"),
  is_primary: z.boolean().default(false),
});

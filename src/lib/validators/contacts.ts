import { z } from "zod";
import {
  birthDateSchema,
  expectedUpdatedAtSchema,
  uuidString,
  urlSchema,
} from "./common";

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
  department: z.string().max(100).nullable().optional(),
  job_title: z.string().max(100).nullable().optional(),
  birth_date: birthDateSchema,
  blood_type: z.enum(["A", "B", "AB", "O"]).nullable().optional(),
  potential_number: z.number().int().min(1).max(60).nullable().optional(),
  constellation_id: uuidString().nullable().optional(),
  lead_source_id: uuidString().nullable().optional(),
  line_user_id: z.string().nullable().optional(),
  internal_memo: z.string().max(2000).nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
  website_url: urlSchema,
});

// インボイス登録番号は取引の主体（取引先）に紐づく情報なので連絡先では扱わない。
// 住所も entity_addresses へ移したためここには無い
export const createContactSchema = contactBaseSchema;

export const updateContactSchema = contactBaseSchema
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema });

// contact_emails / contact_phones のスキーマはここには置かない。
// チャネルの追加・更新は src/actions/contact-channels.ts が担っており、
// そちらが親連絡先の owner_user_id を見た認可を行う。
// 認可を持たない旧経路（contacts.ts の addContactEmail 等）は 2026-08-03 に削除した

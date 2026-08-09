import { z } from "zod";
import {
  birthDateSchema,
  expectedUpdatedAtSchema,
  uuidString,
  urlSchema,
} from "./common";
import { contactSocialAccountDraftSchema } from "./contact-social-accounts";

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

/**
 * 新規作成時にまとめて登録する連絡手段・住所。
 *
 * 既存の連絡先に足すときは `src/actions/contact-channels.ts` が担う（その場で反映）。
 * こちらは**まだ ID の無い相手**に対する下書きなので、値だけを受け取り
 * DB 関数 create_contact_with_details が親子まとめて書き込む。
 * 形式のルール（メールの正規表現・ラベルの許可値）は両者で揃える。
 */
const EMAIL_LABELS = ["work", "personal", "other"] as const;
const PHONE_LABELS = ["work", "mobile", "home", "fax", "other"] as const;

export const contactEmailDraftSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "メールアドレスを入力してください")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "メールアドレスの形式が正しくありません"),
  label: z.enum(EMAIL_LABELS).default("work"),
});

export const contactPhoneDraftSchema = z.object({
  phone: z.string().trim().min(1, "電話番号を入力してください").max(50),
  label: z.enum(PHONE_LABELS).default("work"),
});

export const contactAddressDraftSchema = z.object({
  postal_code: z.string().trim().max(20).nullable().optional(),
  prefecture: z.string().trim().max(20).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  address_line1: z.string().trim().max(200).nullable().optional(),
  address_line2: z.string().trim().max(200).nullable().optional(),
  label: z
    .enum(["main", "billing", "shipping", "branch", "home", "other"])
    .default("main"),
});

// インボイス登録番号は取引の主体（取引先）に紐づく情報なので連絡先では扱わない。
// 住所は entity_addresses が持つため、ここでは作成時の下書きとしてだけ受け取る
export const createContactSchema = contactBaseSchema.extend({
  emails: z.array(contactEmailDraftSchema).max(10).optional(),
  phones: z.array(contactPhoneDraftSchema).max(10).optional(),
  address: contactAddressDraftSchema.nullable().optional(),
  /**
   * SNS・チャット。サービスごとに入れるものが違う（LINE ID / Chatwork の
   * ルーム ID / Slack はワークスペース + メンバー ID）が、形の検査は
   * 既存の連絡口追加（`contact-social-accounts.ts`）と同じくここでは行わない
   * （どのサービスがワークスペース必須かはマスタが持つため）。
   */
  social_accounts: z.array(contactSocialAccountDraftSchema).max(20).optional(),
  /**
   * 取引先の詳細から追加したときの紐づけ先。**contacts の列ではない**
   * （連絡先と取引先は account_contacts で N:M）。DB 関数が紐づけを張る
   */
  account_id: uuidString().nullable().optional(),
});

export const updateContactSchema = contactBaseSchema
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema });

// contact_emails / contact_phones のスキーマはここには置かない。
// チャネルの追加・更新は src/actions/contact-channels.ts が担っており、
// そちらが親連絡先の owner_user_id を見た認可を行う。
// 認可を持たない旧経路（contacts.ts の addContactEmail 等）は 2026-08-03 に削除した

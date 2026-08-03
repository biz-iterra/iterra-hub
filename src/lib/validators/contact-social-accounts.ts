import { z } from "zod";

import { uuidString } from "./common";

/**
 * 連絡先の SNS・チャットの連絡口。
 *
 * 何を入れる欄なのかはサービスごとに違う（LINE ID / Chatwork のルーム ID /
 * Slack のメンバー ID …）ので、形の検査はここでは行わない。**開けるかどうかは
 * URL を組み立てる時点で決まる**（`src/lib/social-links.ts`）。
 */

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

export const contactSocialAccountBaseSchema = z.object({
  contact_id: uuidString(),
  service_id: uuidString("サービスを選んでください"),
  account_id: z
    .string()
    .trim()
    .min(1, "ID は必須です")
    .max(200),
  workspace: optionalText(100),
  display_name: optionalText(100),
  note: optionalText(500),
});

export const createContactSocialAccountSchema = contactSocialAccountBaseSchema;

export const updateContactSocialAccountSchema = contactSocialAccountBaseSchema
  .omit({ contact_id: true })
  .partial();

export type CreateContactSocialAccountInput = z.input<
  typeof createContactSocialAccountSchema
>;

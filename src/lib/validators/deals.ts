import { z } from "zod";
import { expectedUpdatedAtSchema, uuidString } from "./common";

/**
 * 商談の相手先。
 *
 * **取引先は契約が成立するまで存在しない**（database-design.md §16）。
 * そのため商談は取引先・事業者情報・連絡先のいずれでも相手を示せる
 * （DB 側も `deals_counterparty_check` で「いずれか 1 つ以上」を要求する）。
 * 2026-08-04 まで画面と Zod が `account_id` を必須にしており、
 * 契約前の相手と商談を作れなかった。
 *
 * **3 つは排他ではない。** 商談の相手は「Ａ社のＢさん」であることが普通で、
 * 事業者情報と連絡先を同時に持てる。2026-08-07 まで画面がラジオで 1 つしか
 * 選ばせておらず、DB 制約（いずれか 1 つ以上）より狭かった（T-0064）。
 */
const counterpartyFields = {
  account_id: uuidString().nullable().optional(),
  company_id: uuidString().nullable().optional(),
  contact_id: uuidString().nullable().optional(),
};

const hasCounterparty = (data: {
  account_id?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
}) => !!(data.account_id || data.company_id || data.contact_id);

const COUNTERPARTY_MESSAGE =
  "相手先を選んでください（事業者情報・連絡先・取引先のいずれか。複数選べます）";

export const createDealSchema = z.object({
  name: z.string().min(1, "取引名は必須です").max(200),
  pipeline_type_id: uuidString("パイプラインは必須です"),
  deal_stage_id: uuidString("ステージは必須です"),
  deal_status_id: uuidString("ステータスは必須です"),
  amount: z.number().int().min(0).nullable().optional(),
  ...counterpartyFields,
  owner_user_id: uuidString().nullable().optional(),
  application_date: z.string().nullable().optional(),
  review_completed_date: z.string().nullable().optional(),
  expected_close_date: z.string().nullable().optional(),
  /**
   * プロジェクトの詳細から作ったときの紐づけ先。**deals の列ではない**
   * （商談とプロジェクトは deal_projects で N:M）。作成後に紐づけを張る
   */
  project_id: uuidString().nullable().optional(),
})
  .refine(hasCounterparty, {
    message: COUNTERPARTY_MESSAGE,
    path: ["account_id"],
  })
  .refine(
    (data) => {
      if (data.application_date && data.review_completed_date) {
        return data.review_completed_date >= data.application_date;
      }
      return true;
    },
    { message: "審査完了日は申請日以降にしてください", path: ["review_completed_date"] }
  );

export const updateDealSchema = z.object({
  /** 楽観ロック: 編集開始時点の updated_at */
  expected_updated_at: expectedUpdatedAtSchema,
  name: z.string().min(1).max(200).optional(),
  pipeline_type_id: uuidString().optional(),
  deal_stage_id: uuidString().optional(),
  deal_status_id: uuidString().optional(),
  amount: z.number().int().min(0).nullable().optional(),
  ...counterpartyFields,
  owner_user_id: uuidString().nullable().optional(),
  application_date: z.string().nullable().optional(),
  review_completed_date: z.string().nullable().optional(),
  expected_close_date: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
});

// deal_services
export const createDealServiceSchema = z.object({
  deal_id: uuidString(),
  service_id: uuidString(),
});

// カンバン D&D によるステージ/ステータス移動
export const moveDealCardSchema = z.object({
  dealId: uuidString("[dealId] UUID 形式で指定してください"),
  groupBy: z.enum(["stage", "status"]),
  targetId: uuidString("[targetId] UUID 形式で指定してください"),
  expectedUpdatedAt: z
    .string()
    .min(1, "[expectedUpdatedAt] 楽観ロックのため必須です"),
});

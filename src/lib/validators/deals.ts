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
 * **排他ではない。** 商談の相手は「Ａ社のＢさん」であることが普通で、
 * 事業者情報と連絡先を同時に持てる。2026-08-07 まで画面がラジオで 1 つしか
 * 選ばせておらず、DB 制約（いずれか 1 つ以上）より狭かった（T-0064）。
 *
 * **新規作成では取引先を受け取らない**（T-0070）。契約が成立したときに
 * 自動で作られるものなので、作る時点では存在しない。更新側は
 * 「既にある取引先を選び直す」ために残してある。
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
  "相手先を選んでください（事業者情報・連絡先のいずれか。両方選べます）";

const dateOrderRefine = (data: {
  application_date?: string | null;
  review_completed_date?: string | null;
}) => {
  if (data.application_date && data.review_completed_date) {
    return data.review_completed_date >= data.application_date;
  }
  return true;
};

/**
 * 商談の新規作成。
 *
 * **取引先（`account_id`）は受け取らない**（2026-08-08。T-0070）。
 * 取引先は契約が成立したときに `ensure_account_on_contract` が作るもので、
 * 商談を作る時点では存在しない。DB 制約に合わせて選べるようにしていたが、
 * 業務の流れとして筋が通っていなかった。
 *
 * **リードは `createDealWithLeadSchema` が受け取る。** こちらは
 * プロジェクトからの作成など、リードを介さない経路のために残してある。
 */
export const createDealSchema = z.object({
  name: z.string().min(1, "取引名は必須です").max(200),
  pipeline_type_id: uuidString("パイプラインは必須です"),
  deal_stage_id: uuidString("ステージは必須です"),
  deal_status_id: uuidString("ステータスは必須です"),
  amount: z.number().int().min(0).nullable().optional(),
  company_id: uuidString().nullable().optional(),
  contact_id: uuidString().nullable().optional(),
  lead_id: uuidString().nullable().optional(),
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
    path: ["company_id"],
  })
  .refine(dateOrderRefine, {
    message: "審査完了日は申請日以降にしてください",
    path: ["review_completed_date"],
  });

/** 商談の新規作成でリードを新しく作るときの入力 */
const newLeadForDealSchema = z.object({
  lead_name: z.string().min(1, "リード名を入力してください").max(200),
  account_type_id: uuidString("事業者種別を選んでください"),
  stage_id: uuidString("リードのステージは必須です"),
  status_id: uuidString().nullable().optional(),
  lead_source_id: uuidString().nullable().optional(),
  company_id: uuidString().nullable().optional(),
  contact_id: uuidString().nullable().optional(),
  company_name: z.string().max(200).nullable().optional(),
  owner_user_id: uuidString().nullable().optional(),
});

/**
 * リード起点の商談作成（T-0070）。
 *
 * **セールスの商談には元になったリードが必要**（`pipeline_types.requires_lead`）。
 * 既存のリードを選ぶか、その場でリードを作る。TQL 未満のリードは
 * `raise_stage_id` を渡して選定へ上げてから商談を作る。
 */
export const createDealWithLeadSchema = z
  .object({
    lead_mode: z.enum(["existing", "new"]),
    lead_id: uuidString().nullable().optional(),
    new_lead: newLeadForDealSchema.nullable().optional(),
    /** TQL 未満のリードをその場で上げる先。人が明示的に同意したときだけ入る */
    raise_stage_id: uuidString().nullable().optional(),
    raise_status_id: uuidString().nullable().optional(),

    name: z.string().min(1, "取引名は必須です").max(200),
    pipeline_type_id: uuidString("パイプラインは必須です"),
    deal_stage_id: uuidString("ステージは必須です"),
    deal_status_id: uuidString("ステータスは必須です"),
    amount: z.number().int().min(0).nullable().optional(),
    company_id: uuidString().nullable().optional(),
    contact_id: uuidString().nullable().optional(),
    owner_user_id: uuidString().nullable().optional(),
    application_date: z.string().nullable().optional(),
    review_completed_date: z.string().nullable().optional(),
    expected_close_date: z.string().nullable().optional(),
    project_id: uuidString().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.lead_mode === "existing" && !data.lead_id) {
      ctx.addIssue({
        code: "custom",
        path: ["lead_id"],
        message: "リードを選んでください",
      });
    }
    if (data.lead_mode === "new" && !data.new_lead) {
      ctx.addIssue({
        code: "custom",
        path: ["new_lead"],
        message: "リードの情報を入力してください",
      });
    }
    if (!hasCounterparty(data)) {
      ctx.addIssue({
        code: "custom",
        path: ["company_id"],
        message: COUNTERPARTY_MESSAGE,
      });
    }
    if (!dateOrderRefine(data)) {
      ctx.addIssue({
        code: "custom",
        path: ["review_completed_date"],
        message: "審査完了日は申請日以降にしてください",
      });
    }
  });

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

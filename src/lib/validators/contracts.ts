import { z } from "zod";
import { expectedUpdatedAtSchema, uuidString } from "./common";

const contractBaseSchema = z.object({
  /**
   * 商談（任意）。
   *
   * **どの商談にも紐づかない契約を持てる**（2026-08-08。T-0065）。
   * 以前は NOT NULL で、商談の画面からの「紐づけ」が必ず
   * 他の商談から奪う付け替えになっていた。
   */
  deal_id: uuidString().nullable().optional(),
  contract_method: z.enum(["paper", "electronic", "verbal"]).nullable().optional(),
  contract_type_id: uuidString().nullable().optional(),
  /** 契約書名。人が入れる文書名。自動生成の契約名の材料になる */
  contract_name: z.string().max(200).nullable().optional(),
  /**
   * 契約金額。
   *
   * `deals.amount` とは別に持つ。1 商談に複数の契約が下がるため
   * 「商談の金額 = この契約の金額」ではない（T-0068）。
   */
  amount: z.number().int().min(0, "金額は 0 以上で入力してください").nullable().optional(),
  counterparty_type: z.enum(["company", "individual"]).nullable().optional(),
  counterparty_company_id: uuidString().nullable().optional(),
  counterparty_contact_id: uuidString().nullable().optional(),
  counterparty_manager_id: uuidString().nullable().optional(),
  contract_content: z.string().max(5000).nullable().optional(),
  sent_date: z.string().nullable().optional(),
  signback_date: z.string().nullable().optional(),
  execution_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  auto_renewal: z.boolean().default(false),
  cancellation_date: z.string().nullable().optional(),
  original_document_url: z.string().url().nullable().optional(),
  contract_url: z.string().url().nullable().optional(),
  registered_by: uuidString().nullable().optional(),
});

export const createContractSchema = contractBaseSchema.refine(
  (data) => !data.start_date || !data.end_date || data.end_date >= data.start_date,
  { message: "終了日は開始日以降にしてください", path: ["end_date"] }
).refine(
  (data) => !data.sent_date || !data.signback_date || data.signback_date >= data.sent_date,
  { message: "サインバック日は送付日以降にしてください", path: ["signback_date"] }
);

export const updateContractSchema = contractBaseSchema
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema });

/**
 * どの商談にも紐づいていない契約を、商談へ紐づける。
 *
 * **他の商談に紐づいている契約は対象にしない**（T-0065）。付け替えを許すと
 * 別の商談から黙って契約を奪うことになるため、いったん元の商談で
 * 紐づけを解除してもらう。
 */
export const linkContractToDealSchema = z.object({
  contract_id: uuidString("契約を選んでください"),
  deal_id: uuidString("商談は必須です"),
  /**
   * 楽観ロック: 選んだ時点の契約の `updated_at`。
   *
   * 他の更新系と違い**必須**にしている。候補一覧を開いたまま放置すると、
   * その間に他の人が同じ契約を別の商談へ紐づけている可能性がある
   */
  expected_updated_at: z.string().min(1, "契約の更新時刻が取れませんでした。画面を再読み込みしてください"),
});

/**
 * 契約を商談から外す（`deal_id` を NULL に戻す）。
 *
 * **契約そのものは残る。** どの商談にも紐づかない状態になり、
 * あとから同じ商談にも別の商談にも紐づけ直せる（T-0067）。
 *
 * `deal_id` を受け取るのは「いま本当にこの商談に付いているか」を
 * 突き合わせるため。古い画面から押されたときに別の商談の紐づけを外さない。
 */
export const unlinkContractFromDealSchema = z.object({
  contract_id: uuidString("契約を選んでください"),
  deal_id: uuidString("商談は必須です"),
  expected_updated_at: z.string().min(1, "契約の更新時刻が取れませんでした。画面を再読み込みしてください"),
});

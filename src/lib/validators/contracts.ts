import { z } from "zod";

const contractBaseSchema = z.object({
  deal_id: z.string().uuid("ディールは必須です"),
  contract_method: z.enum(["paper", "electronic", "verbal"]).nullable().optional(),
  contract_type_id: z.string().uuid().nullable().optional(),
  contract_name: z.string().max(200).nullable().optional(),
  counterparty_type: z.enum(["company", "individual"]).nullable().optional(),
  counterparty_company_id: z.string().uuid().nullable().optional(),
  counterparty_contact_id: z.string().uuid().nullable().optional(),
  counterparty_manager_id: z.string().uuid().nullable().optional(),
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
  registered_by: z.string().uuid().nullable().optional(),
});

export const createContractSchema = contractBaseSchema.refine(
  (data) => !data.start_date || !data.end_date || data.end_date >= data.start_date,
  { message: "終了日は開始日以降にしてください", path: ["end_date"] }
).refine(
  (data) => !data.sent_date || !data.signback_date || data.signback_date >= data.sent_date,
  { message: "サインバック日は送付日以降にしてください", path: ["signback_date"] }
);

export const updateContractSchema = contractBaseSchema.partial();

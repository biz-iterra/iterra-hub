import { z } from "zod";

import { expectedUpdatedAtSchema, uuidString } from "./common";

/**
 * 金融機関情報（振込先の口座）。
 *
 * 事業者に付く。1 つの事業者が複数の口座を持てるので、住所と同じく
 * 本体とは別に増減させる。
 *
 * 桁数は全銀協の様式に合わせる（金融機関コード 4 桁 / 支店コード 3 桁 /
 * 口座番号 7 桁）。DB 側も同じ長さで切ってある。
 */

export const ACCOUNT_TYPES = [
  { value: "ordinary", label: "普通" },
  { value: "current", label: "当座" },
  { value: "savings", label: "貯蓄" },
] as const;

export function accountTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return ACCOUNT_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** 空文字は「未入力」として null に寄せる。フォームからは "" が来る */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

const digits = (len: number, name: string) =>
  z
    .string()
    .regex(new RegExp(`^[0-9]{${len}}$`), `${name}は半角数字 ${len} 桁で入力してください`)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null));

export const financialInfoBaseSchema = z.object({
  company_id: uuidString(),
  bank_name: z.string().min(1, "金融機関名は必須です").max(100),
  bank_code: digits(4, "金融機関コード"),
  branch_name: optionalText(100),
  branch_code: digits(3, "支店コード"),
  account_type: z
    .enum(["ordinary", "current", "savings"])
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  // 7 桁に満たない口座は先頭 0 詰めで届くことがあるので、桁数は縛らず数字だけ見る
  account_number: z
    .string()
    .regex(/^[0-9]{1,7}$/, "口座番号は半角数字 7 桁以内で入力してください")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  account_holder: optionalText(100),
  account_holder_kana: optionalText(100),
  is_primary: z.boolean().optional(),
});

export const createFinancialInfoSchema = financialInfoBaseSchema;

export const updateFinancialInfoSchema = financialInfoBaseSchema
  .omit({ company_id: true })
  .partial()
  .extend({ expected_updated_at: expectedUpdatedAtSchema });

export type CreateFinancialInfoInput = z.input<typeof createFinancialInfoSchema>;
export type UpdateFinancialInfoInput = z.input<typeof updateFinancialInfoSchema>;

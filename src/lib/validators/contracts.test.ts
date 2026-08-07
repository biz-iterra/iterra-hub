import { describe, expect, it } from "vitest";
import {
  createContractSchema,
  linkContractToDealSchema,
  unlinkContractFromDealSchema,
} from "./contracts";

/**
 * UT-74: 契約のバリデーション
 *
 * 2026-08-08 に `contracts.deal_id` を NULL 許容へ変え（T-0065）、
 * 契約に金額を持たせた（T-0068）。スキーマがそれに追随していること。
 *
 * 紐づけ／解除は**楽観ロックを必須**にしている。候補一覧や商談の編集画面を
 * 開いたまま放置している間に、他の人が同じ契約を触っている可能性があるため。
 */

const uuid = "00000000-0000-4000-8000-000000000001";

describe("createContractSchema", () => {
  it("商談を選ばなくても通る（未紐づけの契約を作れる）", () => {
    const result = createContractSchema.safeParse({ contract_name: "業務委託基本契約書" });
    expect(result.success).toBe(true);
  });

  it("商談に null を渡しても通る", () => {
    expect(createContractSchema.safeParse({ deal_id: null }).success).toBe(true);
  });

  it("金額は 0 以上の整数なら通る", () => {
    expect(createContractSchema.safeParse({ amount: 0 }).success).toBe(true);
    expect(createContractSchema.safeParse({ amount: 1200000 }).success).toBe(true);
    expect(createContractSchema.safeParse({ amount: null }).success).toBe(true);
  });

  it("負の金額と小数は弾く", () => {
    expect(createContractSchema.safeParse({ amount: -1 }).success).toBe(false);
    expect(createContractSchema.safeParse({ amount: 1000.5 }).success).toBe(false);
  });

  it("日付の前後関係は今までどおり検査する", () => {
    const bad = createContractSchema.safeParse({
      start_date: "2026-08-10",
      end_date: "2026-08-01",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0].message).toContain("終了日は開始日以降");
    }
  });
});

describe("linkContractToDealSchema / unlinkContractFromDealSchema", () => {
  const valid = {
    contract_id: uuid,
    deal_id: uuid,
    expected_updated_at: "2026-08-08T00:00:00.000Z",
  };

  it("3 つそろえば通る", () => {
    expect(linkContractToDealSchema.safeParse(valid).success).toBe(true);
    expect(unlinkContractFromDealSchema.safeParse(valid).success).toBe(true);
  });

  it("**楽観ロックが無いと通らない**（後勝ちで他人の紐づけを壊さないため）", () => {
    const { expected_updated_at: _omitted, ...withoutLock } = valid;
    expect(linkContractToDealSchema.safeParse(withoutLock).success).toBe(false);
    expect(unlinkContractFromDealSchema.safeParse(withoutLock).success).toBe(false);
    expect(
      linkContractToDealSchema.safeParse({ ...valid, expected_updated_at: "" }).success
    ).toBe(false);
  });

  it("解除でも商談は必須（いま本当にその商談に付いているかを突き合わせる）", () => {
    const { deal_id: _omitted, ...withoutDeal } = valid;
    expect(unlinkContractFromDealSchema.safeParse(withoutDeal).success).toBe(false);
  });
});

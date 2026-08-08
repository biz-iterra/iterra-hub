import { describe, expect, it } from "vitest";
import { createDealSchema, createDealWithLeadSchema } from "./deals";

/**
 * UT-76: 商談のバリデーション（T-0070）
 *
 * **新規作成は取引先を受け取らない。** 取引先は契約が成立したときに
 * `ensure_account_on_contract` が作るもので、商談を作る時点では存在しない。
 * DB 制約（相手先はいずれか 1 つ以上）に合わせて選ばせていたが、
 * 業務の流れとして筋が通っていなかった。
 */

const uuid = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";

const base = {
  name: "テスト案件",
  pipeline_type_id: uuid,
  deal_stage_id: uuid,
  deal_status_id: uuid,
};

describe("createDealSchema", () => {
  it("相手先が 1 つあれば通る", () => {
    expect(createDealSchema.safeParse({ ...base, company_id: uuid }).success).toBe(true);
    expect(createDealSchema.safeParse({ ...base, contact_id: uuid }).success).toBe(true);
  });

  it("相手先が無いと落ちる", () => {
    const r = createDealSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["company_id"]);
  });

  it("**取引先を渡しても相手先とは見なさない**（受け取らない列）", () => {
    const r = createDealSchema.safeParse({ ...base, account_id: uuid });
    expect(r.success).toBe(false);
  });

  it("審査完了日は申請日以降", () => {
    const r = createDealSchema.safeParse({
      ...base,
      company_id: uuid,
      application_date: "2026-08-10",
      review_completed_date: "2026-08-01",
    });
    expect(r.success).toBe(false);
  });
});

describe("createDealWithLeadSchema", () => {
  const withLead = { ...base, company_id: uuid };

  it("既存のリードを選べば通る", () => {
    const r = createDealWithLeadSchema.safeParse({
      ...withLead,
      lead_mode: "existing",
      lead_id: other,
    });
    expect(r.success).toBe(true);
  });

  it("既存モードでリードが無いと落ちる", () => {
    const r = createDealWithLeadSchema.safeParse({ ...withLead, lead_mode: "existing" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("lead_id"))).toBe(true);
    }
  });

  it("新規モードはリード名と事業者種別が要る", () => {
    const ok = createDealWithLeadSchema.safeParse({
      ...withLead,
      lead_mode: "new",
      new_lead: {
        lead_name: "新しいリード",
        account_type_id: uuid,
        stage_id: uuid,
      },
    });
    expect(ok.success).toBe(true);

    const ng = createDealWithLeadSchema.safeParse({
      ...withLead,
      lead_mode: "new",
      new_lead: { lead_name: "", account_type_id: uuid, stage_id: uuid },
    });
    expect(ng.success).toBe(false);
  });

  it("新規モードで new_lead が無いと落ちる", () => {
    const r = createDealWithLeadSchema.safeParse({ ...withLead, lead_mode: "new" });
    expect(r.success).toBe(false);
  });

  it("相手先が無いと落ちる（リードがあっても）", () => {
    const r = createDealWithLeadSchema.safeParse({
      ...base,
      lead_mode: "existing",
      lead_id: other,
    });
    expect(r.success).toBe(false);
  });
});

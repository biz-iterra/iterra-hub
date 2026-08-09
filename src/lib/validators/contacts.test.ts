import { describe, expect, it } from "vitest";
import { createContactSchema } from "./contacts";

/**
 * T-0026: 連絡先の新規作成に SNS・チャットも載せる。
 *
 * createContactSchema 全体は既存（T-0024 分含む）が未テストのため、
 * このテストでは今回追加した `social_accounts` の分岐のみを対象にする。
 */

const VALID_UUID = "c0000000-0000-0000-0000-000000000001";
const SERVICE_UUID = "c0000000-0000-0000-0000-000000000002";

const baseInput = {
  last_name: "山田",
  first_name: "太郎",
  contact_status_id: VALID_UUID,
};

describe("createContactSchema.social_accounts", () => {
  it("未指定でも成功する（SNS・チャットは任意）", () => {
    const result = createContactSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("空配列でも成功する", () => {
    const result = createContactSchema.safeParse({ ...baseInput, social_accounts: [] });
    expect(result.success).toBe(true);
  });

  it("service_id・account_id が揃っていれば成功する", () => {
    const result = createContactSchema.safeParse({
      ...baseInput,
      social_accounts: [{ service_id: SERVICE_UUID, account_id: "abc" }],
    });
    expect(result.success).toBe(true);
  });

  it("account_id が空の行は拒否する（[social_accounts.0.account_id] 形式で返る）", () => {
    const result = createContactSchema.safeParse({
      ...baseInput,
      social_accounts: [{ service_id: SERVICE_UUID, account_id: "" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["social_accounts", 0, "account_id"]);
      expect(result.error.issues[0].message).toBe("ID は必須です");
    }
  });

  it("service_id が UUID 形式でない行は拒否する", () => {
    const result = createContactSchema.safeParse({
      ...baseInput,
      social_accounts: [{ service_id: "not-a-uuid", account_id: "abc" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("サービスを選んでください");
    }
  });

  it("21 件目以降は拒否する（上限 20）", () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      service_id: SERVICE_UUID,
      account_id: `id-${i}`,
    }));
    const result = createContactSchema.safeParse({ ...baseInput, social_accounts: rows });
    expect(result.success).toBe(false);
  });

  it("workspace / display_name の空文字は null に寄せる", () => {
    const result = createContactSchema.safeParse({
      ...baseInput,
      social_accounts: [
        { service_id: SERVICE_UUID, account_id: "abc", workspace: "", display_name: "" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const row = result.data.social_accounts?.[0];
      expect(row?.workspace).toBeNull();
      expect(row?.display_name).toBeNull();
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  contactSocialAccountBaseSchema,
  contactSocialAccountDraftSchema,
} from "./contact-social-accounts";

const VALID_UUID = "c0000000-0000-0000-0000-000000000001";
const SERVICE_UUID = "c0000000-0000-0000-0000-000000000002";

const baseInput = {
  contact_id: VALID_UUID,
  service_id: SERVICE_UUID,
  account_id: "abc",
};

describe("contactSocialAccountBaseSchema", () => {
  it("account_id の前後の空白を trim して保存する", () => {
    const result = contactSocialAccountBaseSchema.safeParse({
      ...baseInput,
      account_id: " abc ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.account_id).toBe("abc");
  });

  it("空白のみの account_id は trim してから必須チェックにかかり拒否する（UT-52）", () => {
    const result = contactSocialAccountBaseSchema.safeParse({
      ...baseInput,
      account_id: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["account_id"]);
      expect(result.error.issues[0].message).toBe("ID は必須です");
    }
  });

  it("空文字の account_id も拒否する", () => {
    const result = contactSocialAccountBaseSchema.safeParse({
      ...baseInput,
      account_id: "",
    });
    expect(result.success).toBe(false);
  });

  it("必須項目が揃っていれば成功する", () => {
    const result = contactSocialAccountBaseSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it("service_id が UUID 形式でなければ拒否する", () => {
    const result = contactSocialAccountBaseSchema.safeParse({
      ...baseInput,
      service_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("サービスを選んでください");
    }
  });

  it("workspace / display_name / note の空文字は null に寄せる", () => {
    const result = contactSocialAccountBaseSchema.safeParse({
      ...baseInput,
      workspace: "",
      display_name: "",
      note: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workspace).toBeNull();
      expect(result.data.display_name).toBeNull();
      expect(result.data.note).toBeNull();
    }
  });
});

// T-0026: 連絡先の新規作成に SNS・チャットを載せる。まだ ID の無い相手が対象なので
// contact_id を持たない下書き用スキーマ（createContactSchema.social_accounts が使う）
describe("contactSocialAccountDraftSchema", () => {
  const draftInput = {
    service_id: SERVICE_UUID,
    account_id: "abc",
  };

  it("contact_id が無くても成功する（作成前は ID を持たないため）", () => {
    const result = contactSocialAccountDraftSchema.safeParse(draftInput);
    expect(result.success).toBe(true);
  });

  it("contact_id を送っても無視される（omit 済みのため型に残らない）", () => {
    const result = contactSocialAccountDraftSchema.safeParse({
      ...draftInput,
      contact_id: VALID_UUID,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).contact_id).toBeUndefined();
    }
  });

  it("service_id 未選択は拒否する", () => {
    const result = contactSocialAccountDraftSchema.safeParse({
      ...draftInput,
      service_id: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("サービスを選んでください");
    }
  });

  it("account_id 未入力は拒否する", () => {
    const result = contactSocialAccountDraftSchema.safeParse({
      ...draftInput,
      account_id: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ID は必須です");
    }
  });
});

import { describe, expect, it } from "vitest";
import { createCompanySchema, updateCompanySchema } from "./companies";

/**
 * T-0087: 個人事業主の作成時に本人の連絡先を同時に作る。
 *
 * 対象は `createCompanySchema` に足した `representative`（本人の連絡先の下書き）と、
 * 既存の refine（インボイス）が壊れていないこと。
 * `updateCompanySchema` は今回不変なので、`representative` を持たないことだけ確認する。
 */

const STATUS_UUID = "d0000000-0000-0000-0000-000000000001";

const baseInput = {
  name: "佐川商店",
  company_status_id: STATUS_UUID,
};

describe("createCompanySchema.representative", () => {
  it("未指定でも成功する（同時作成は必須ではない）", () => {
    const result = createCompanySchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.representative).toBeUndefined();
  });

  it("null でも成功する（チェックを外した場合）", () => {
    const result = createCompanySchema.safeParse({ ...baseInput, representative: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.representative).toBeNull();
  });

  it("姓名が揃っていれば成功する（カナは任意）", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      representative: { last_name: "佐川", first_name: "琴美" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.representative?.last_name).toBe("佐川");
      expect(result.data.representative?.last_name_kana).toBeUndefined();
    }
  });

  it("カナも受け取る", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      representative: {
        last_name: "佐川",
        first_name: "琴美",
        last_name_kana: "サガワ",
        first_name_kana: "コトミ",
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.representative?.first_name_kana).toBe("コトミ");
    }
  });

  it("姓が空なら拒否する（path で欄が特定できる）", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      representative: { last_name: "", first_name: "琴美" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["representative", "last_name"]);
      expect(result.error.issues[0].message).toBe("姓は必須です");
    }
  });

  it("名が空なら拒否する", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      representative: { last_name: "佐川", first_name: "" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["representative", "first_name"]);
      expect(result.error.issues[0].message).toBe("名は必須です");
    }
  });

  it("空白だけの姓は拒否する（trim してから長さを見る）", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      representative: { last_name: "   ", first_name: "琴美" },
    });
    expect(result.success).toBe(false);
  });

  it("51 文字以上の姓は拒否する（contacts と同じ上限 50）", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      representative: { last_name: "あ".repeat(51), first_name: "琴美" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("姓は50文字以内で入力してください");
    }
  });

  it("51 文字以上のカナは拒否する", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      representative: {
        last_name: "佐川",
        first_name: "琴美",
        last_name_kana: "ア".repeat(51),
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("セイは50文字以内で入力してください");
    }
  });
});

describe("createCompanySchema の既存の検査（非回帰）", () => {
  it("事業者名が空なら拒否する", () => {
    const result = createCompanySchema.safeParse({ ...baseInput, name: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("会社名は必須です");
  });

  it("ステータス未指定なら拒否する", () => {
    const result = createCompanySchema.safeParse({ name: "佐川商店" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("ステータスは必須です");
  });

  it("インボイス登録ありで番号が無ければ拒否する（extend しても refine が効く）", () => {
    const result = createCompanySchema.safeParse({ ...baseInput, invoice_registered: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["invoice_registration_number"]);
      expect(result.error.issues[0].message).toBe("インボイス登録ありの場合、登録番号は必須です");
    }
  });

  it("インボイス登録ありで番号があれば成功する（本人の連絡先と併用できる）", () => {
    const result = createCompanySchema.safeParse({
      ...baseInput,
      invoice_registered: true,
      invoice_registration_number: "T1234567890123",
      representative: { last_name: "佐川", first_name: "琴美" },
    });
    expect(result.success).toBe(true);
  });

  it("法人番号が 13 桁でなければ拒否する", () => {
    const result = createCompanySchema.safeParse({ ...baseInput, corporate_number: "123" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("法人番号は13桁の数字です");
  });
});

describe("updateCompanySchema", () => {
  it("representative は受け取らない（同時作成は新規作成だけの経路）", () => {
    const result = updateCompanySchema.safeParse({
      name: "佐川商店",
      representative: { last_name: "佐川", first_name: "琴美" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("representative" in result.data).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  buildFreeeCreatePayload,
  buildFreeeUpdatePayload,
  DEFAULT_TITLE,
  type FreeeCompanySource,
} from "./payload";

/**
 * 送ってよい項目の関所。
 *
 * 取引先コードを選ぶと freee が 400
 * 「不正なリクエストです。 / このAPIでは code の指定はできません。」を返し、
 * **同時に選んだ他の項目まで巻き添えで落ちていた**（2026-08-05）。
 */
describe("buildFreeeUpdatePayload", () => {
  it("取引先コードは送らない（更新 API が受け付けない）", () => {
    const payload = buildFreeeUpdatePayload([{ field: "code", crm: "CMP-000001" }]);
    expect(payload).not.toHaveProperty("code");
    expect(Object.keys(payload)).toHaveLength(0);
  });

  it("取引先コードが混ざっても、他の項目は送れる", () => {
    const payload = buildFreeeUpdatePayload([
      { field: "code", crm: "CMP-000001" },
      { field: "phone", crm: "03-1234-5678" },
    ]);
    expect(payload).not.toHaveProperty("code");
    expect(payload.phone).toBe("03-1234-5678");
  });

  it("会社名は基本情報の名前と書類の正式名称の両方へ入れる", () => {
    const payload = buildFreeeUpdatePayload([
      { field: "name", crm: "株式会社イテラ" },
    ]);
    expect(payload.name).toBe("株式会社イテラ");
    expect(payload.long_name).toBe("株式会社イテラ");
  });

  it("カナは正式名称（カナ）へ入れる", () => {
    // 基本情報の「名前（ふりがな）」は API に項目が無く設定できない
    const payload = buildFreeeUpdatePayload([
      { field: "name_kana", crm: "カブシキガイシャイテラ" },
    ]);
    expect(payload.name_kana).toBe("カブシキガイシャイテラ");
  });

  it("敬称を送れる（未設定のときだけ差分に出る）", () => {
    const payload = buildFreeeUpdatePayload([{ field: "default_title", crm: "様" }]);
    expect(payload.default_title).toBe("様");
  });

  it("名称が空なら送らない（freee は name 必須で、空だと更新全体が落ちる）", () => {
    expect(buildFreeeUpdatePayload([{ field: "name", crm: null }])).toEqual({});
    expect(buildFreeeUpdatePayload([{ field: "name", crm: "" }])).toEqual({});
  });

  it("住所は 1 つの address_attributes にまとめる", () => {
    const payload = buildFreeeUpdatePayload([
      { field: "zipcode", crm: "1500001" },
      { field: "prefecture", crm: "東京都" },
      { field: "street", crm: "渋谷区神宮前1-1-1" },
      { field: "building", crm: "イテラビル 3F" },
    ]);
    expect(payload.address_attributes).toEqual({
      zipcode: "1500001",
      // 都道府県は 0 始まりのコード。東京都は 12
      prefecture_code: 12,
      street_name1: "渋谷区神宮前1-1-1",
      street_name2: "イテラビル 3F",
    });
  });

  it("口座は 1 つの partner_bank_account_attributes にまとめる", () => {
    const payload = buildFreeeUpdatePayload([
      { field: "bank_name", crm: "みずほ銀行" },
      { field: "branch_name", crm: "渋谷支店" },
      { field: "account_number", crm: "1234567" },
      { field: "account_holder", crm: "カ）イテラ" },
      { field: "account_type", crm: "current" },
    ]);
    expect(payload.partner_bank_account_attributes).toEqual({
      bank_name: "みずほ銀行",
      branch_name: "渋谷支店",
      account_number: "1234567",
      long_account_name: "カ）イテラ",
      // 当座の綴りが違う（CRM: current / freee: checking）
      account_type: "checking",
    });
  });

  it("画面の表示語を freee の値へ戻す", () => {
    expect(
      buildFreeeUpdatePayload([{ field: "qualified_invoice_issuer", crm: "該当する" }])
        .qualified_invoice_issuer
    ).toBe(true);
    expect(
      buildFreeeUpdatePayload([{ field: "qualified_invoice_issuer", crm: "該当しない" }])
        .qualified_invoice_issuer
    ).toBe(false);
    expect(buildFreeeUpdatePayload([{ field: "org_code", crm: "個人" }]).org_code).toBe(2);
    expect(buildFreeeUpdatePayload([{ field: "org_code", crm: "法人" }]).org_code).toBe(1);
  });

  it("知らない項目は無視する（画面から何を送られても増えない）", () => {
    expect(buildFreeeUpdatePayload([{ field: "corporate_number", crm: "1234567890123" }]))
      .toEqual({});
  });
});

/**
 * 新規登録。**ここでしか取引先コードを入れられない**（更新 API は受け付けない）。
 * 事業所設定が「取引先コードを使用する」なので、空で送ると
 * 400「Codeを入力してください。」になる。
 */
describe("buildFreeeCreatePayload", () => {
  const base: FreeeCompanySource = {
    company_id: "10000000-0000-0000-0000-000000000001",
    company_code: "CMP-000001",
    name: "株式会社イテラ",
    name_kana: null,
    phone: null,
    invoice_registration_number: null,
    invoice_registered: false,
    org_code: null,
    contact_name: null,
    contact_email: null,
    zipcode: null,
    prefecture: null,
    street: null,
    building: null,
    bank_name: null,
    branch_name: null,
    account_number: null,
    account_holder: null,
    account_type: null,
  };

  it("事業者コードを取引先コードとして入れる", () => {
    expect(buildFreeeCreatePayload(base).code).toBe("CMP-000001");
  });

  it("会社名は基本情報の名前と書類の正式名称の両方へ入れる", () => {
    const payload = buildFreeeCreatePayload(base);
    expect(payload.name).toBe("株式会社イテラ");
    expect(payload.long_name).toBe("株式会社イテラ");
  });

  it("敬称は既定で「様」を入れる（CRM に項目が無いため）", () => {
    expect(buildFreeeCreatePayload(base).default_title).toBe("様");
    expect(DEFAULT_TITLE).toBe("様");
  });

  it("カナは正式名称（カナ）へ入れる", () => {
    // 基本情報の「名前（ふりがな）」は API に項目が無く設定できない
    const payload = buildFreeeCreatePayload({ ...base, name_kana: "カブシキガイシャイテラ" });
    expect(payload.name_kana).toBe("カブシキガイシャイテラ");
  });

  it("値の無い項目は送らない（freee 側に空欄を作らない）", () => {
    const payload = buildFreeeCreatePayload(base);
    expect(payload).not.toHaveProperty("name_kana");
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("address_attributes");
    expect(payload).not.toHaveProperty("partner_bank_account_attributes");
    expect(payload).not.toHaveProperty("org_code");
  });

  it("空白だけの値も送らない", () => {
    const payload = buildFreeeCreatePayload({ ...base, name_kana: "  ", phone: "" });
    expect(payload).not.toHaveProperty("name_kana");
    expect(payload).not.toHaveProperty("phone");
  });

  it("インボイス番号が無ければ適格フラグも送らない（不整合を作らない）", () => {
    expect(buildFreeeCreatePayload(base)).not.toHaveProperty("qualified_invoice_issuer");
    const registered = buildFreeeCreatePayload({
      ...base,
      invoice_registration_number: "T1234567890123",
      invoice_registered: true,
    });
    expect(registered.invoice_registration_number).toBe("T1234567890123");
    expect(registered.qualified_invoice_issuer).toBe(true);
  });

  it("住所は 1 つにまとめ、都道府県はコードへ変換する", () => {
    const payload = buildFreeeCreatePayload({
      ...base,
      zipcode: "1500001",
      prefecture: "東京都",
      street: "渋谷区神宮前1-1-1",
      building: null,
    });
    expect(payload.address_attributes).toEqual({
      zipcode: "1500001",
      prefecture_code: 12,
      street_name1: "渋谷区神宮前1-1-1",
    });
  });

  it("判定できない都道府県は送らない（全県ずれる事故を避ける）", () => {
    const payload = buildFreeeCreatePayload({ ...base, prefecture: "東京" });
    expect(payload).not.toHaveProperty("address_attributes");
  });

  it("口座種別は freee の綴りへ直す（current → checking）", () => {
    const payload = buildFreeeCreatePayload({
      ...base,
      bank_name: "みずほ銀行",
      account_type: "current",
    });
    expect(payload.partner_bank_account_attributes).toEqual({
      bank_name: "みずほ銀行",
      account_type: "checking",
    });
  });

  it("法人格から法人 / 個人を入れる。未設定なら送らない", () => {
    expect(buildFreeeCreatePayload({ ...base, org_code: 2 }).org_code).toBe(2);
    expect(buildFreeeCreatePayload({ ...base, org_code: 1 }).org_code).toBe(1);
    expect(buildFreeeCreatePayload({ ...base, org_code: null })).not.toHaveProperty(
      "org_code"
    );
  });
});

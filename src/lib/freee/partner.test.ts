import { describe, expect, it } from "vitest";
import {
  deriveCorporateNumber,
  isValidInvoiceNumber,
  toPartnerRow,
  type FreeePartner,
} from "./partner";

describe("isValidInvoiceNumber", () => {
  it("T + 13 桁を受け付ける", () => {
    expect(isValidInvoiceNumber("T1234567890123")).toBe(true);
  });

  it.each<[string | null | undefined, string]>([
    ["1234567890123", "T が無い"],
    ["T123456789012", "12 桁"],
    ["T12345678901234", "14 桁"],
    ["t1234567890123", "小文字の t"],
    ["", "空文字"],
    [null, "null"],
    [undefined, "undefined"],
  ])("%s（%s）は弾く", (value) => {
    expect(isValidInvoiceNumber(value)).toBe(false);
  });
});

describe("deriveCorporateNumber", () => {
  it("法人（org_code=1）の T 番号から 13 桁を導出する", () => {
    expect(deriveCorporateNumber(1, "T1234567890123")).toBe("1234567890123");
  });

  it("個人事業主（org_code=2）の T 番号からは導出しない（法人番号ではない）", () => {
    expect(deriveCorporateNumber(2, "T1234567890123")).toBeNull();
  });

  it("org_code 未設定（null）は法人と確認できないので導出しない", () => {
    expect(deriveCorporateNumber(null, "T1234567890123")).toBeNull();
    expect(deriveCorporateNumber(undefined, "T1234567890123")).toBeNull();
  });

  it("形式不正の番号からは導出しない", () => {
    expect(deriveCorporateNumber(1, "T123")).toBeNull();
    expect(deriveCorporateNumber(1, "1234567890123")).toBeNull();
    expect(deriveCorporateNumber(1, null)).toBeNull();
  });
});

describe("toPartnerRow", () => {
  const base: FreeePartner = {
    id: 101,
    company_id: 999,
    name: "テスト商事株式会社",
    available: true,
    update_date: "2026-08-01",
  };

  it("最小構成の Partner を変換する（未設定項目は null）", () => {
    const row = toPartnerRow(base);
    expect(row.freee_partner_id).toBe(101);
    expect(row.name).toBe("テスト商事株式会社");
    expect(row.code).toBeNull();
    expect(row.org_code).toBeNull();
    expect(row.invoice_registration_number).toBeNull();
    expect(row.address_prefecture_code).toBeNull();
    expect(row.available).toBe(true);
    expect(row.freee_update_date).toBe("2026-08-01");
  });

  it("全項目を写像する", () => {
    const row = toPartnerRow({
      ...base,
      code: "P-001",
      long_name: "テスト商事株式会社 東京本社",
      name_kana: "テストショウジ",
      org_code: 1,
      country_code: "JP",
      phone: "03-1234-5678",
      contact_name: "山田太郎",
      email: "yamada@test-shoji.example.jp",
      qualified_invoice_issuer: true,
      invoice_registration_number: "T1234567890123",
      address_attributes: {
        zipcode: "100-0001",
        prefecture_code: 12, // 東京都
        street_name1: "千代田区丸の内1-1-1",
        street_name2: "テストビル 3F",
      },
    });
    expect(row.long_name).toBe("テスト商事株式会社 東京本社");
    expect(row.org_code).toBe(1);
    expect(row.invoice_registration_number).toBe("T1234567890123");
    expect(row.address_prefecture_code).toBe(12);
    expect(row.address_street_name1).toBe("千代田区丸の内1-1-1");
  });

  it("空文字は null に潰す（freee は未入力を空文字で返すことがある）", () => {
    const row = toPartnerRow({ ...base, code: "", phone: "  ", email: "" });
    expect(row.code).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.email).toBeNull();
  });

  it("形式外のインボイス番号は持ち込まない（導出列の誤爆防止）", () => {
    const row = toPartnerRow({
      ...base,
      org_code: 1,
      invoice_registration_number: "T123",
    });
    expect(row.invoice_registration_number).toBeNull();
  });

  it("prefecture_code の範囲外（-1 = 設定しない）は null", () => {
    const row = toPartnerRow({
      ...base,
      address_attributes: { prefecture_code: -1 },
    });
    expect(row.address_prefecture_code).toBeNull();
  });

  it("org_code の未知の値は null に潰す", () => {
    const row = toPartnerRow({ ...base, org_code: 9 });
    expect(row.org_code).toBeNull();
  });

  it("available=false（freee 側で使用停止）を写す", () => {
    const row = toPartnerRow({ ...base, available: false });
    expect(row.available).toBe(false);
  });

  it("update_date の形式が崩れていたら null（DATE キャストで落とさない）", () => {
    const row = toPartnerRow({ ...base, update_date: "2026/08/01" });
    expect(row.freee_update_date).toBeNull();
  });
});

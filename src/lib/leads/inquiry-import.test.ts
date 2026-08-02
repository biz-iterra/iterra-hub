import { describe, expect, it } from "vitest";
import {
  formatDetailJson,
  splitPersonName,
  toInquiryLead,
  type InquiryRow,
} from "./inquiry-import";

const base: InquiryRow = {
  id: "11111111-2222-3333-4444-555555555555",
  form_type: "contact",
  label: "hands-on",
  email: "Taro@Example.com ",
  name: "山田 太郎",
  company: "㈱テスト商事",
  tel: "03-1234-5678",
  source: "top-hero",
  is_first: 1,
  detail_json: '{"message":"導入を検討しています","budget":""}',
  created_at: "2026-08-01T02:03:04.000Z",
};

describe("splitPersonName", () => {
  it("姓と名に分ける", () => {
    expect(splitPersonName("山田 太郎")).toEqual({ last: "山田", first: "太郎" });
  });

  it("全角空白でも分ける", () => {
    expect(splitPersonName("山田　太郎")).toEqual({ last: "山田", first: "太郎" });
  });

  it("区切りが無ければ姓に寄せる", () => {
    expect(splitPersonName("やまだたろう")).toEqual({
      last: "やまだたろう",
      first: null,
    });
  });

  it("3 つ以上に割れたら最後を名にする", () => {
    expect(splitPersonName("de la Cruz Juan")).toEqual({
      last: "de la Cruz",
      first: "Juan",
    });
  });

  it("空値は両方 null", () => {
    expect(splitPersonName("")).toEqual({ last: null, first: null });
    expect(splitPersonName(null)).toEqual({ last: null, first: null });
  });
});

describe("formatDetailJson", () => {
  it("空の項目は落とす", () => {
    expect(formatDetailJson('{"message":"あり","budget":""}')).toEqual([
      "message: あり",
    ]);
  });

  it("壊れた JSON でも落ちない", () => {
    expect(formatDetailJson("{壊れている")).toEqual([]);
    expect(formatDetailJson(null)).toEqual([]);
  });

  it("配列や文字列は扱わない", () => {
    expect(formatDetailJson('["a","b"]')).toEqual([]);
    expect(formatDetailJson('"文字列"')).toEqual([]);
  });
});

describe("toInquiryLead", () => {
  it("会社名をリード名にし、略記を開く", () => {
    const lead = toInquiryLead(base);
    expect(lead.lead_name).toBe("株式会社テスト商事");
    expect(lead.company_name).toBe("株式会社テスト商事");
  });

  it("メールは小文字に揃える", () => {
    expect(toInquiryLead(base).contact_email).toBe("taro@example.com");
  });

  it("名刺取込と衝突しない鍵を作る", () => {
    expect(toInquiryLead(base).external_key).toBe(`inquiry:${base.id}`);
  });

  it("本文に種別・内容・経路とフォーム項目を並べる", () => {
    expect(toInquiryLead(base).detail).toBe(
      [
        "種別: お問い合わせフォーム",
        "内容: ハンズオン",
        "経路: top-hero",
        "message: 導入を検討しています",
      ].join("\n")
    );
  });

  it("会社名が無ければ氏名、それも無ければメールをリード名にする", () => {
    expect(toInquiryLead({ ...base, company: "" }).lead_name).toBe("山田 太郎");
    expect(
      toInquiryLead({ ...base, company: "", name: "" }).lead_name
    ).toBe("taro@example.com");
  });

  it("未知の種別は元の値をそのまま出す", () => {
    const lead = toInquiryLead({ ...base, form_type: "unknown", label: "xyz" });
    expect(lead.detail).toContain("種別: unknown");
    expect(lead.detail).toContain("内容: xyz");
  });
});

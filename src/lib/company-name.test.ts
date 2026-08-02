import { describe, expect, it } from "vitest";
import {
  detectCorporateType,
  expandCorporateAbbreviations,
  formatCompanyName,
} from "./company-name";

/**
 * 会社名の表記整えと法人格の判定。
 * DB 関数 expand_corporate_abbreviations / resolve_corporate_type_id と
 * 同じ結果になることを前提にしているため、規則を変えるときはここも直す。
 */

describe("expandCorporateAbbreviations", () => {
  it("株式会社の略記を位置を保ったまま開く", () => {
    expect(expandCorporateAbbreviations("㈱テスト")).toBe("株式会社テスト");
    expect(expandCorporateAbbreviations("テスト㈱")).toBe("テスト株式会社");
    expect(expandCorporateAbbreviations("（株）テスト")).toBe("株式会社テスト");
    expect(expandCorporateAbbreviations("(株)テスト")).toBe("株式会社テスト");
  });

  it("株式会社以外の略記も開く", () => {
    expect(expandCorporateAbbreviations("㈲やまだ")).toBe("有限会社やまだ");
    expect(expandCorporateAbbreviations("（同）あおぞら")).toBe("合同会社あおぞら");
    expect(expandCorporateAbbreviations("㈾みなと")).toBe("合資会社みなと");
    expect(expandCorporateAbbreviations("（一社）日本◯◯協会")).toBe(
      "一般社団法人日本◯◯協会"
    );
    expect(expandCorporateAbbreviations("（特非）まちづくり")).toBe(
      "特定非営利活動法人まちづくり"
    );
  });

  it("1 つの名前に複数の略記があっても開く", () => {
    expect(expandCorporateAbbreviations("㈱A・㈲B")).toBe("株式会社A・有限会社B");
  });

  it("正式表記はそのまま残す", () => {
    expect(expandCorporateAbbreviations("株式会社テスト")).toBe("株式会社テスト");
    expect(expandCorporateAbbreviations("NPO法人あかり")).toBe("NPO法人あかり");
  });

  it("旧制度の財団法人・社団法人も開く", () => {
    expect(expandCorporateAbbreviations("㈶やまがた産業支援機構")).toBe(
      "財団法人やまがた産業支援機構"
    );
    expect(expandCorporateAbbreviations("（財）災害科学研究所")).toBe(
      "財団法人災害科学研究所"
    );
    expect(expandCorporateAbbreviations("（社）小石川医師会")).toBe(
      "社団法人小石川医師会"
    );
  });

  it("複合した略記を単独より先に当てる", () => {
    // 「㈶」を先に開くと「(一般財団法人)」になってしまう
    expect(expandCorporateAbbreviations("(一般㈶)秋田県建設技術センター")).toBe(
      "一般財団法人秋田県建設技術センター"
    );
    expect(expandCorporateAbbreviations("(公益㈶)あきた企業活性化センター")).toBe(
      "公益財団法人あきた企業活性化センター"
    );
  });

  it("空値は空文字を返す", () => {
    expect(expandCorporateAbbreviations(null)).toBe("");
    expect(expandCorporateAbbreviations(undefined)).toBe("");
    expect(expandCorporateAbbreviations("")).toBe("");
  });
});

describe("formatCompanyName", () => {
  it("全角スペースを半角にし、連続する空白を詰める", () => {
    expect(formatCompanyName("株式会社　テスト")).toBe("株式会社 テスト");
    expect(formatCompanyName("株式会社   テスト")).toBe("株式会社 テスト");
  });

  it("前後の空白を落とす", () => {
    expect(formatCompanyName("  ㈱テスト  ")).toBe("株式会社テスト");
  });
});

describe("detectCorporateType", () => {
  const types = [
    { id: "1", name: "株式会社" },
    { id: "2", name: "有限会社" },
    { id: "3", name: "合同会社" },
    { id: "4", name: "一般社団法人" },
    { id: "5", name: "NPO法人" },
    { id: "6", name: "個人事業主" },
  ];

  it("名称に含まれる法人格を返す", () => {
    expect(detectCorporateType("株式会社テスト", types)?.id).toBe("1");
    expect(detectCorporateType("テスト合同会社", types)?.id).toBe("3");
    expect(detectCorporateType("NPO法人あかり", types)?.id).toBe("5");
  });

  it("略記でも判定できる", () => {
    expect(detectCorporateType("㈱テスト", types)?.id).toBe("1");
    expect(detectCorporateType("（有）やまだ", types)?.id).toBe("2");
  });

  it("長い綴りを優先する", () => {
    const withShort = [...types, { id: "7", name: "社団法人" }];
    expect(detectCorporateType("一般社団法人日本◯◯協会", withShort)?.id).toBe("4");
  });

  it("法人格が現れない名称は null", () => {
    expect(detectCorporateType("やまだ商店", types)).toBeNull();
    expect(detectCorporateType("", types)).toBeNull();
    expect(detectCorporateType(null, types)).toBeNull();
  });
});

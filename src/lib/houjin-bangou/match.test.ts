import { describe, expect, it } from "vitest";
import { normalizeCompanyName, matchCompany, diffCompany } from "./match";
import { parseHoujinCsv } from "./parse";
import type { HoujinRecord } from "./parse";

/**
 * 正規化の規則は DB 関数 normalize_company_name と一致していなければならない。
 * ここで規則を固定し、片方だけ変わったことに気付けるようにする。
 */
describe("normalizeCompanyName", () => {
  it("法人格の表記ゆれを吸収する", () => {
    expect(normalizeCompanyName("株式会社ABC")).toBe("abc");
    expect(normalizeCompanyName("(株)ABC")).toBe("abc");
    expect(normalizeCompanyName("ABC株式会社")).toBe("abc");
    expect(normalizeCompanyName("（株）ABC")).toBe("abc");
  });

  it("全角英数字を半角にする", () => {
    expect(normalizeCompanyName("ＡＢＣ株式会社")).toBe("abc");
    expect(normalizeCompanyName("株式会社１２３")).toBe("123");
  });

  it("区切り記号と空白を落とす", () => {
    expect(normalizeCompanyName("有限会社エム・ティー・エム")).toBe("エムティエム");
    expect(normalizeCompanyName("ABC 株式会社")).toBe("abc");
    expect(normalizeCompanyName("A&B商事")).toBe("ab商事");
  });

  it("空値は空文字を返す", () => {
    expect(normalizeCompanyName(null)).toBe("");
    expect(normalizeCompanyName(undefined)).toBe("");
    expect(normalizeCompanyName("")).toBe("");
  });
});

function record(over: Partial<HoujinRecord> = {}): HoujinRecord {
  return {
    corporateNumber: "1234567890123",
    name: "株式会社テスト",
    prefecture: "東京都",
    city: "千代田区",
    street: "丸の内1-1-1",
    postCode: "1000005",
    closeDate: "",
    closeCause: "",
    successorNumber: "",
    isLatest: true,
    ...over,
  };
}

describe("matchCompany", () => {
  it("正規化名が完全一致する 1 件だけを採用する", () => {
    const result = matchCompany("(株)テスト", [
      record({ name: "株式会社テスト" }),
      record({ corporateNumber: "9999999999999", name: "株式会社テストサービス" }),
    ]);
    expect(result.kind).toBe("matched");
    if (result.kind === "matched") {
      expect(result.record.corporateNumber).toBe("1234567890123");
    }
  });

  it("過去の履歴（isLatest=false）は対象にしない", () => {
    const result = matchCompany("株式会社テスト", [
      record({ isLatest: false }),
    ]);
    expect(result.kind).toBe("not_found");
  });

  it("同名が複数あるときは人に回す", () => {
    const result = matchCompany("株式会社テスト", [
      record({ corporateNumber: "1111111111111" }),
      record({ corporateNumber: "2222222222222" }),
    ]);
    expect(result.kind).toBe("ambiguous");
  });

  it("閉鎖済みは matched と区別する", () => {
    const result = matchCompany("株式会社テスト", [
      record({ closeDate: "2025-03-31", closeCause: "01" }),
    ]);
    expect(result.kind).toBe("closed");
  });

  it("候補が無ければ not_found", () => {
    expect(matchCompany("株式会社テスト", []).kind).toBe("not_found");
  });

  it("対象名が空なら照合しない", () => {
    expect(matchCompany("", [record()]).kind).toBe("not_found");
  });
});

describe("diffCompany", () => {
  it("表記ゆれだけの違いは差分にしない", () => {
    const diffs = diffCompany(
      { name: "(株)テスト", address: "東京都千代田区丸の内1-1-1" },
      record()
    );
    expect(diffs).toEqual([]);
  });

  it("商号が変わっていれば検知する", () => {
    const diffs = diffCompany(
      { name: "株式会社旧商号", address: "東京都千代田区丸の内1-1-1" },
      record()
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe("name");
    expect(diffs[0].after).toBe("株式会社テスト");
  });

  it("所在地が変わっていれば検知する", () => {
    const diffs = diffCompany(
      { name: "株式会社テスト", address: "大阪府大阪市北区1-1" },
      record()
    );
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe("address");
  });

  it("台帳に住所が無い場合は差分にしない（未入力であって変更ではない）", () => {
    const diffs = diffCompany({ name: "株式会社テスト", address: "" }, record());
    expect(diffs).toEqual([]);
  });
});

describe("parseHoujinCsv", () => {
  // Ver.4 の CSV は 30 列・ヘッダ無し
  function csvRow(over: Record<number, string> = {}): string {
    const cols = Array.from({ length: 30 }, () => "");
    cols[0] = "1";
    cols[1] = "1234567890123";
    cols[6] = "株式会社テスト";
    cols[9] = "東京都";
    cols[10] = "千代田区";
    cols[11] = "丸の内1-1-1";
    cols[15] = "1000005";
    cols[23] = "1";
    for (const [i, v] of Object.entries(over)) cols[Number(i)] = v;
    return cols.join(",");
  }

  it("必要な列を取り出す", () => {
    const [r] = parseHoujinCsv(csvRow());
    expect(r.corporateNumber).toBe("1234567890123");
    expect(r.name).toBe("株式会社テスト");
    expect(r.prefecture).toBe("東京都");
    expect(r.isLatest).toBe(true);
  });

  it("法人番号が 13 桁でない行は捨てる", () => {
    expect(parseHoujinCsv(csvRow({ 1: "123" }))).toHaveLength(0);
  });

  it("列数が足りない行は捨てる", () => {
    expect(parseHoujinCsv("1,1234567890123,,")).toHaveLength(0);
  });

  it("空のレスポンスでも落ちない", () => {
    expect(parseHoujinCsv("")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildExternalKey,
  decodeCsv,
  dropEmptyRows,
  extractDomain,
  normalizeCompanyName,
  normalizeDate,
  normalizeEmail,
  normalizePhone,
  parseAddress,
  parseCsv,
} from "./import-helpers";

describe("decodeCsv", () => {
  const encode = (text: string) => new Uint8Array(Buffer.from(text, "utf8"));

  it("UTF-8 を判定する", () => {
    const r = decodeCsv(encode("会社名,姓,名\n株式会社テスト,山田,太郎\n"));
    expect(r.encoding).toBe("utf-8");
    expect(r.text.startsWith("会社名")).toBe(true);
  });

  it("BOM 付き UTF-8 を判定する", () => {
    const r = decodeCsv(new Uint8Array(Buffer.from("﻿会社名,姓\n", "utf8")));
    expect(r.encoding).toBe("utf-8");
  });

  it("Shift_JIS を判定する", () => {
    // Shift_JIS の「会社名」= 0x89EF 0x8ED0 0x96BC
    const sjis = new Uint8Array([0x89, 0xef, 0x8e, 0xd0, 0x96, 0xbc, 0x0a]);
    const r = decodeCsv(sjis);
    expect(r.encoding).toBe("shift_jis");
    expect(r.text.trim()).toBe("会社名");
  });

  it("Shift_JIS を UTF-8 として黙って化けさせない", () => {
    // fatal を外すと化けて通ってしまう。判定順序に依存しないことを担保する
    const sjis = new Uint8Array([0x89, 0xef, 0x8e, 0xd0, 0x96, 0xbc]);
    expect(decodeCsv(sjis).text).toBe("会社名");
  });

  it("ASCII のみは UTF-8 として扱う", () => {
    expect(decodeCsv(encode("a,b,c\n")).encoding).toBe("utf-8");
  });
});

describe("normalizeCompanyName", () => {
  it("全角空白と連続空白を整える", () => {
    expect(normalizeCompanyName("　株式会社　テスト　")).toBe("株式会社 テスト");
  });

  it("法人格の略記を正式表記に揃える", () => {
    expect(normalizeCompanyName("㈱テスト")).toBe("株式会社テスト");
    expect(normalizeCompanyName("(株)テスト")).toBe("株式会社テスト");
    expect(normalizeCompanyName("（株）テスト")).toBe("株式会社テスト");
    expect(normalizeCompanyName("㈲テスト")).toBe("有限会社テスト");
  });

  it("法人格は除去しない（別法人を同一視しないため）", () => {
    expect(normalizeCompanyName("株式会社A")).not.toBe(normalizeCompanyName("有限会社A"));
  });
});

describe("normalizePhone", () => {
  it("Eight 実データにある 4 形式を統一する", () => {
    expect(normalizePhone("03-1234-5678")).toBe("0312345678");
    expect(normalizePhone("092-123-4567")).toBe("0921234567");
    expect(normalizePhone("0123-45-6789")).toBe("0123456789");
    expect(normalizePhone("090-1234-5678")).toBe("09012345678");
  });

  it("ハイフンなしをそのまま数字列にする", () => {
    expect(normalizePhone("09012345678")).toBe("09012345678");
  });

  it("国番号 +81 を 0 に直す", () => {
    expect(normalizePhone("+81-90-1234-5678")).toBe("09012345678");
  });

  it("括弧・全角ハイフンを除去する", () => {
    expect(normalizePhone("(03)1234-5678")).toBe("0312345678");
    expect(normalizePhone("03−1234−5678")).toBe("0312345678");
  });

  it("8 桁未満はノイズとして捨てる", () => {
    expect(normalizePhone("123-4567")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("小文字化して trim する", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com");
  });

  it("@ を含まない値は無効にする", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("normalizeDate", () => {
  it("Eight の YYYY/MM/DD を ISO 形式にする", () => {
    expect(normalizeDate("2025/03/19")).toBe("2025-03-19");
    expect(normalizeDate("2025/3/9")).toBe("2025-03-09");
  });

  it("ハイフン区切りも受け付ける", () => {
    expect(normalizeDate("2025-03-19")).toBe("2025-03-19");
  });

  it("年省略形式を defaultYear で補完する", () => {
    expect(normalizeDate("3/19", 2024)).toBe("2024-03-19");
  });

  it("不正値は null", () => {
    expect(normalizeDate("2025年3月19日")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });

  it("実在しない月日は null にする（UT-01: DATE 型カラムへ渡すと DB エラーになるため）", () => {
    expect(normalizeDate("2025/13/40")).toBeNull();
    expect(normalizeDate("2025/02/30")).toBeNull();
  });

  it("うるう年の 2/29 は年によって扱いを分ける", () => {
    expect(normalizeDate("2024/02/29")).toBe("2024-02-29");
    expect(normalizeDate("2025/02/29")).toBeNull();
  });
});

describe("extractDomain", () => {
  it("www を除いたホスト名を返す", () => {
    expect(extractDomain("https://www.Example.com/path?q=1")).toBe("example.com");
  });

  it("スキームなしでも解釈する", () => {
    expect(extractDomain("example.co.jp")).toBe("example.co.jp");
  });

  it("無効な値は null", () => {
    expect(extractDomain("")).toBeNull();
    expect(extractDomain(null)).toBeNull();
  });
});

describe("parseAddress", () => {
  it("都道府県・市区町村・以降を分ける", () => {
    const a = parseAddress("100-0001", "東京都千代田区丸の内1-1-1 パレスビル5F");
    expect(a.postal_code).toBe("100-0001");
    expect(a.prefecture).toBe("東京都");
    expect(a.city).toBe("千代田区");
    expect(a.address_line1).toBe("丸の内1-1-1 パレスビル5F");
    expect(a.raw_text).toBe("東京都千代田区丸の内1-1-1 パレスビル5F");
  });

  it("神奈川県・鹿児島県のような 4 文字の県を取り違えない", () => {
    expect(parseAddress(null, "神奈川県横浜市西区1-1").prefecture).toBe("神奈川県");
    expect(parseAddress(null, "鹿児島県鹿児島市1-1").prefecture).toBe("鹿児島県");
    expect(parseAddress(null, "和歌山県和歌山市1-1").prefecture).toBe("和歌山県");
  });

  it("市が連続する地名を取りこぼさない", () => {
    const a = parseAddress(null, "三重県四日市市安島1-1");
    expect(a.city).toBe("四日市市");
    expect(a.address_line1).toBe("安島1-1");
    const b = parseAddress(null, "千葉県市川市八幡1-1");
    expect(b.city).toBe("市川市");
  });

  it("政令指定都市の区は address_line1 に回す（予測可能さを優先）", () => {
    const a = parseAddress(null, "大阪府大阪市北区同心1-6-2");
    expect(a.city).toBe("大阪市");
    expect(a.address_line1).toBe("北区同心1-6-2");
  });

  it("都道府県が省略された住所は prefecture を null にし全文を line1 に入れる", () => {
    const a = parseAddress(null, "墨田区江東橋2-3-11");
    expect(a.prefecture).toBeNull();
    expect(a.city).toBeNull();
    expect(a.address_line1).toBe("墨田区江東橋2-3-11");
    expect(a.raw_text).toBe("墨田区江東橋2-3-11");
  });

  it("郡は区切りにせず、郡＋町村をまとめて city にする", () => {
    // 「郡」を区切り文字に入れていないため、市区町村レベルの単位で取れる
    const a = parseAddress(null, "長野県北佐久郡軽井沢町1-1");
    expect(a.city).toBe("北佐久郡軽井沢町");
    expect(a.address_line1).toBe("1-1");
  });

  it("空の住所でも郵便番号だけは保持する", () => {
    const a = parseAddress("100-0001", "");
    expect(a.postal_code).toBe("100-0001");
    expect(a.raw_text).toBeNull();
    expect(a.address_line1).toBeNull();
  });

  it("郵便番号から余分な文字を除く", () => {
    expect(parseAddress("〒100-0001", "東京都").postal_code).toBe("100-0001");
  });
});

describe("buildExternalKey", () => {
  it("メールがあればメール由来のキーを返す", () => {
    expect(buildExternalKey("eight", { email: "A@Example.com" })).toBe(
      "eight:mail:a@example.com"
    );
  });

  it("メールの大文字小文字・前後空白で別キーにならない", () => {
    const a = buildExternalKey("eight", { email: " Foo@Example.COM " });
    const b = buildExternalKey("eight", { email: "foo@example.com" });
    expect(a).toBe(b);
  });

  it("メールが無ければ会社名と氏名のハッシュを使う", () => {
    const k = buildExternalKey("eight", {
      companyName: "株式会社テスト",
      lastName: "山田",
      firstName: "太郎",
    });
    expect(k).toMatch(/^eight:hash:[0-9a-f]{16}$/);
  });

  it("同じ会社名・氏名なら同じハッシュになる", () => {
    const p = { companyName: "㈱テスト", lastName: "山田", firstName: "太郎" };
    const q = { companyName: "株式会社テスト", lastName: "山田", firstName: "太郎" };
    expect(buildExternalKey("eight", p)).toBe(buildExternalKey("eight", q));
  });

  it("会社名が違えば別キーになる", () => {
    const a = buildExternalKey("eight", { companyName: "A社", lastName: "山田" });
    const b = buildExternalKey("eight", { companyName: "B社", lastName: "山田" });
    expect(a).not.toBe(b);
  });

  it("識別材料が何も無ければ null", () => {
    expect(buildExternalKey("eight", {})).toBeNull();
    expect(buildExternalKey("eight", { email: "", companyName: "", lastName: "" })).toBeNull();
  });
});

describe("parseCsv", () => {
  it("引用符とエスケープを処理する", () => {
    const rows = parseCsv('a,"b,c","d""e"\n1,2,3\n');
    expect(rows[0]).toEqual(["a", "b,c", 'd"e']);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });

  it("CRLF を扱う", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("引用符内の改行を保持する", () => {
    const rows = parseCsv('a,"line1\nline2"\n');
    expect(rows[0][1]).toBe("line1\nline2");
  });

  it("BOM を除去する", () => {
    expect(parseCsv("﻿a,b\n")[0][0]).toBe("a");
  });
});

describe("dropEmptyRows", () => {
  it("全フィールドが空の行を落とす", () => {
    expect(dropEmptyRows([["a"], ["", " "], ["b"]])).toEqual([["a"], ["b"]]);
  });
});

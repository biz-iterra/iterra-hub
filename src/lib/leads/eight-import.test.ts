import { describe, expect, it } from "vitest";
import {
  checkEightHeader,
  EIGHT_COLUMNS,
  mergeEightRows,
  parseEightRow,
  type ParsedEightRow,
} from "./eight-import";

/** Eight の実際のヘッダ（18 列） */
const HEADER = [...EIGHT_COLUMNS];

function headerIndex() {
  const r = checkEightHeader(HEADER);
  if (!r.ok) throw new Error(r.error);
  return r.indexOf;
}

/** 列名 → 値で行を組み立てる */
function row(values: Partial<Record<string, string>>): string[] {
  return HEADER.map((c) => values[c] ?? "");
}

describe("checkEightHeader", () => {
  it("Eight のヘッダを受け付ける", () => {
    const r = checkEightHeader(HEADER);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.indexOf["名刺交換日"]).toBe(14);
  });

  it("必須列が欠けていれば理由を返す", () => {
    const r = checkEightHeader(["会社名", "姓", "名"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("e-mail");
      expect(r.error).toContain("名刺交換日");
    }
  });

  it("未知の列が増えても受け付ける（値は raw に残す）", () => {
    const r = checkEightHeader([...HEADER, "新しい列"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.indexOf["新しい列"]).toBe(18);
  });

  it("列順が変わっても列名で解決する", () => {
    const shuffled = ["名刺交換日", "e-mail", "名", "姓", "会社名"];
    const r = checkEightHeader(shuffled);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.indexOf["会社名"]).toBe(4);
  });
});

describe("parseEightRow", () => {
  const idx = headerIndex();

  it("名刺の各項目を Lead にマッピングする", () => {
    const p = parseEightRow(
      row({
        会社名: "株式会社テスト",
        部署名: "営業部",
        役職: "部長",
        姓: "山田",
        名: "太郎",
        "e-mail": "Yamada@Example.com",
        郵便番号: "100-0001",
        住所: "東京都千代田区丸の内1-1",
        TEL会社: "03-1234-5678",
        携帯電話: "090-1234-5678",
        URL: "https://example.com",
        名刺交換日: "2025/03/19",
      }),
      idx,
      1
    );
    expect(p.error).toBeNull();
    expect(p.lead.lead_name).toBe("株式会社テスト");
    expect(p.lead.contact_department).toBe("営業部");
    expect(p.lead.contact_job_title).toBe("部長");
    expect(p.lead.contact_email).toBe("yamada@example.com");
    expect(p.lead.company_phone).toBe("0312345678");
    expect(p.lead.contact_phone).toBe("09012345678");
    expect(p.address.prefecture).toBe("東京都");
    expect(p.exchangedOn).toBe("2025-03-19");
    expect(p.externalKey).toBe("eight:mail:yamada@example.com");
  });

  it("TEL直通があれば携帯より優先して contact_phone に入れる", () => {
    const p = parseEightRow(
      row({ 会社名: "A社", TEL直通: "03-9999-8888", 携帯電話: "090-1111-2222" }),
      idx,
      1
    );
    expect(p.lead.contact_phone).toBe("0399998888");
  });

  it("会社名が無ければ氏名を lead_name にする", () => {
    const p = parseEightRow(row({ 姓: "山田", 名: "太郎" }), idx, 1);
    expect(p.lead.lead_name).toBe("山田 太郎");
    expect(p.error).toBeNull();
  });

  it("会社名も氏名も無くメールだけある行は取り込む", () => {
    // 実データに 2 行存在する。メールがあれば識別できるため落とさない
    const p = parseEightRow(row({ "e-mail": "foo@example.com" }), idx, 1);
    expect(p.lead.lead_name).toBe("foo@example.com");
    expect(p.error).toBeNull();
  });

  it("識別材料が何も無い行はエラーにする", () => {
    const p = parseEightRow(row({ 名刺交換日: "2025/03/19" }), idx, 7);
    expect(p.error).toContain("リード名を決められません");
    expect(p.externalKey).toBeNull();
    expect(p.rowNumber).toBe(7);
  });

  it("値のある列だけを raw に残す", () => {
    const p = parseEightRow(row({ 会社名: "A社", Fax: "03-1111-2222" }), idx, 1);
    expect(p.raw).toEqual({ 会社名: "A社", Fax: "03-1111-2222" });
    // マッピングしない Fax も raw から取り出せる
    expect(p.raw["Fax"]).toBe("03-1111-2222");
  });

  it("Eight の品質フラグを警告にする", () => {
    const p = parseEightRow(
      row({ 会社名: "A社", 再データ化中の名刺: "1", "'?'を含んだデータ": "1" }),
      idx,
      1
    );
    expect(p.warnings).toHaveLength(2);
    expect(p.warnings[0]).toContain("データ化中");
  });

  it("法人格の略記を揃えたうえで会社名を保存する", () => {
    const p = parseEightRow(row({ 会社名: "㈱テスト" }), idx, 1);
    expect(p.lead.company_name).toBe("株式会社テスト");
  });
});

describe("mergeEightRows", () => {
  const idx = headerIndex();

  const make = (v: Partial<Record<string, string>>, n: number): ParsedEightRow =>
    parseEightRow(row(v), idx, n);

  it("同一メールの複数行を 1 件にまとめ、交換履歴は全件残す", () => {
    const rows = [
      make({ 会社名: "旧会社", "e-mail": "a@example.com", 名刺交換日: "2023/01/01" }, 1),
      make({ 会社名: "新会社", "e-mail": "a@example.com", 名刺交換日: "2025/06/01" }, 2),
      make({ 会社名: "中会社", "e-mail": "a@example.com", 名刺交換日: "2024/03/01" }, 3),
    ];
    const { merged, errors } = mergeEightRows(rows);
    expect(errors).toHaveLength(0);
    expect(merged).toHaveLength(1);
    // 属性は交換日が最新の行を採用する（転職後の情報を優先）
    expect(merged[0].primary.lead.company_name).toBe("新会社");
    // 接点は 3 回すべて残す
    expect(merged[0].rows).toHaveLength(3);
  });

  it("交換日が同じ場合は CSV の後ろの行を採用する", () => {
    const rows = [
      make({ 会社名: "先", "e-mail": "b@example.com", 名刺交換日: "2025/01/01" }, 1),
      make({ 会社名: "後", "e-mail": "b@example.com", 名刺交換日: "2025/01/01" }, 2),
    ];
    const { merged } = mergeEightRows(rows);
    expect(merged[0].primary.lead.company_name).toBe("後");
  });

  it("交換日が無い行は属性の採用対象として後回しにする", () => {
    const rows = [
      make({ 会社名: "日付なし", "e-mail": "c@example.com" }, 1),
      make({ 会社名: "日付あり", "e-mail": "c@example.com", 名刺交換日: "2020/01/01" }, 2),
    ];
    const { merged } = mergeEightRows(rows);
    expect(merged[0].primary.lead.company_name).toBe("日付あり");
  });

  it("メールなしは会社名＋氏名で同一判定する", () => {
    const rows = [
      make({ 会社名: "D社", 姓: "佐藤", 名: "花子", 名刺交換日: "2024/01/01" }, 1),
      make({ 会社名: "D社", 姓: "佐藤", 名: "花子", 名刺交換日: "2025/01/01" }, 2),
    ];
    const { merged } = mergeEightRows(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0].externalKey).toMatch(/^eight:hash:/);
  });

  it("同じ会社の別人は別 Lead にする", () => {
    const rows = [
      make({ 会社名: "E社", 姓: "田中", 名: "一郎" }, 1),
      make({ 会社名: "E社", 姓: "鈴木", 名: "二郎" }, 2),
    ];
    const { merged } = mergeEightRows(rows);
    expect(merged).toHaveLength(2);
  });

  it("エラー行は merged に含めず errors に分ける", () => {
    const rows = [
      make({ 会社名: "F社", "e-mail": "f@example.com" }, 1),
      make({ 名刺交換日: "2025/01/01" }, 2),
    ];
    const { merged, errors } = mergeEightRows(rows);
    expect(merged).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(2);
  });
});

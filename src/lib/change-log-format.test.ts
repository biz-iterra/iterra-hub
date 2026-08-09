import { describe, expect, it } from "vitest";
import {
  describeChange,
  describeChangeText,
  fieldLabel,
  formatValue,
} from "./change-log-format";

/**
 * 変更履歴は**人が読める日本語**にする。
 *
 * 「システムログをそのまま表示させているだけ」という指摘（2026-08-05）への
 * 回帰テスト。実際にこう出ていた:
 *   deleted_at: 空 → 2026-08-05T10:28:37.027+00:00
 *   _row: {"id":"51e0646e-…","fax":null,…（数百文字）
 */

describe("fieldLabel", () => {
  it("共通の列を日本語にする", () => {
    expect(fieldLabel("companies", "sort_order")).toBe("表示順");
    expect(fieldLabel("companies", "deleted_at")).toBe("削除");
  });

  it("テーブルごとに意味が変わる列は個別の名前にする", () => {
    expect(fieldLabel("companies", "name")).toBe("事業者名");
    expect(fieldLabel("accounts", "name")).toBe("取引先名");
    expect(fieldLabel("leads", "lead_name")).toBe("リード名");
  });

  it("マスタの制御列も日本語にする（今日から記録対象）", () => {
    expect(fieldLabel("lead_stages", "requires_deal")).toBe("ディールが必要");
    expect(fieldLabel("account_statuses", "is_active_default")).toBe("契約中の既定");
    expect(fieldLabel("lead_categories", "is_system_required")).toBe("システム必須");
  });

  it("**対応が無い列は隠さず列名のまま出す**", () => {
    // 消すと「何が変わったか分からない」記録になる。読めなくても出す方がまし
    expect(fieldLabel("companies", "unknown_column")).toBe("unknown_column");
  });
});

describe("formatValue", () => {
  it("null・空文字は「未設定」", () => {
    expect(formatValue(null)).toBe("未設定");
    expect(formatValue("")).toBe("未設定");
    expect(formatValue(undefined)).toBe("未設定");
  });

  it("真偽値は「はい / いいえ」", () => {
    expect(formatValue(true)).toBe("はい");
    expect(formatValue(false)).toBe("いいえ");
  });

  it("ISO 日時は和式にして秒とタイムゾーンを落とす", () => {
    expect(formatValue("2026-08-05T10:28:37.027+00:00")).toMatch(/^2026\/8\/5 \d{2}:\d{2}$/);
  });

  it("日付は和式にする", () => {
    expect(formatValue("2026-08-05")).toBe("2026/8/5");
  });

  it("**UUID は名前へ。引けなければ「他のデータ」**（生の UUID を出さない）", () => {
    const id = "a0000000-0000-0000-0000-000000000001";
    expect(formatValue(id, (v) => (v === id ? "管理者テスト" : undefined))).toBe("管理者テスト");
    expect(formatValue(id)).toBe("他のデータ");
  });

  it("長い文字列は切り詰める（一覧が崩れない）", () => {
    const long = "あ".repeat(60);
    expect(formatValue(long)).toHaveLength(41); // 40 文字 + 省略記号
  });

  it("配列・オブジェクトは要約する（生の JSON を出さない）", () => {
    expect(formatValue([1, 2, 3])).toBe("3 件");
    expect(formatValue({ a: 1 })).toBe("（内容あり）");
  });
});

describe("describeChange", () => {
  it("更新は「項目名・変更前・変更後」に開く", () => {
    const entries = describeChange("companies", {
      name: { old: "旧イテラ", new: "株式会社イテラ" },
    });
    expect(entries).toEqual([
      { label: "事業者名", before: "旧イテラ", after: "株式会社イテラ" },
    ]);
  });

  it("**作成は名前だけ要約する**（全カラムの JSON を並べない）", () => {
    const entries = describeChange("companies", {
      _row: {
        id: "51e0646e-a9a7-474d-8839-f7f83f7202b2",
        fax: null,
        name: "検証-個人事業主",
        phone: null,
        sort_key: "ケンショウ",
        created_at: "2026-08-05T10:28:27.055262+00:00",
      },
    });
    expect(entries).toEqual([
      { label: "事業者名", before: "", after: "検証-個人事業主" },
    ]);
  });

  it("削除の記録で deleted_at / deleted_by を主役にしない", () => {
    // 「削除」であることは操作列で分かる。中身は他の変更を見せる
    const entries = describeChange("companies", {
      deleted_at: { old: null, new: "2026-08-05T10:28:37.027+00:00" },
      deleted_by: { old: null, new: "a0000000-0000-0000-0000-000000000001" },
    });
    expect(entries).toEqual([]);
  });

  it("**削除でも「何を消したか」が分かる**（DB が _name を記録する）", () => {
    // deleted_at / deleted_by しか変わらないため、これが無いと変更内容が空になる
    const entries = describeChange("companies", {
      _name: "株式会社イテラ",
      deleted_at: { old: null, new: "2026-08-05T10:28:37.027+00:00" },
      deleted_by: { old: null, new: "a0000000-0000-0000-0000-000000000001" },
    });
    expect(entries).toEqual([
      { label: "対象", before: "", after: "株式会社イテラ" },
    ]);
  });

  it("更新でも対象名を先頭に出す", () => {
    const entries = describeChange("companies", {
      _name: "株式会社イテラ",
      phone: { old: null, new: "03-1234-5678" },
    });
    expect(entries).toEqual([
      { label: "対象", before: "", after: "株式会社イテラ" },
      { label: "電話番号", before: "未設定", after: "03-1234-5678" },
    ]);
  });

  it("マスタの既定変更が読める形になる", () => {
    const entries = describeChange("lead_stages", {
      is_inquiry_default: { old: false, new: true },
    });
    expect(entries).toEqual([
      { label: "問い合わせ取込の既定", before: "いいえ", after: "はい" },
    ]);
  });
});

describe("describeChangeText", () => {
  it("一覧のセル用に 1 行へまとめる", () => {
    const text = describeChangeText("leads", {
      lead_name: { old: "旧名", new: "新名" },
      company_phone: { old: null, new: "03-1234-5678" },
    });
    expect(text).toBe("リード名: 旧名 → 新名 / 会社電話番号: 未設定 → 03-1234-5678");
  });

  it("見せるものが無ければダッシュ", () => {
    expect(describeChangeText("companies", {})).toBe("—");
    expect(describeChangeText("companies", null)).toBe("—");
  });
});

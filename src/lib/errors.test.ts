import { describe, expect, it } from "vitest";
import {
  describeTransportError,
  isFieldValidationError,
  parseFieldError,
} from "./errors";

describe("parseFieldError", () => {
  it("[field] 本文 を分解する", () => {
    expect(parseFieldError("[code] コードを入力してください")).toEqual({
      field: "code",
      message: "コードを入力してください",
    });
  });

  it("本文に括弧や記号が含まれても本文全体を返す", () => {
    expect(
      parseFieldError("[color] バッジ色は # と16進数6桁で入力してください（例: #E53935）")
    ).toEqual({
      field: "color",
      message: "バッジ色は # と16進数6桁で入力してください（例: #E53935）",
    });
  });

  it("プレフィックスが無ければ null（トーストへ回す）", () => {
    expect(parseFieldError("管理者権限が必要です")).toBeNull();
    expect(parseFieldError("他のデータから参照されているため削除できません")).toBeNull();
  });

  it("空・未定義でも落ちない", () => {
    expect(parseFieldError(null)).toBeNull();
    expect(parseFieldError(undefined)).toBeNull();
    expect(parseFieldError("")).toBeNull();
  });

  it("フィールド名に使えない文字が入っていれば分解しない", () => {
    expect(parseFieldError("[表示順] 0以上で入力してください")).toBeNull();
  });
});

describe("describeTransportError", () => {
  // Node 18 以降の File を使う。jsdom 環境でも同じコンストラクタが見える
  const csv = new File(["a".repeat(2 * 1024 * 1024)], "eight.csv", {
    type: "text/csv",
  });

  it("送信サイズ超過は分割を促す。英語の原文は出さない", () => {
    const message = describeTransportError(
      new Error("Body exceeded 1 MB limit."),
      csv
    );
    expect(message).toBe(
      "ファイルが大きすぎて送信できませんでした（eight.csv / 2.00MB）。分割して取り込んでください"
    );
    expect(message).not.toMatch(/Body exceeded/);
  });

  it("通信断は取込履歴の確認を促す（途中まで入っている可能性があるため）", () => {
    expect(describeTransportError(new TypeError("Failed to fetch"), csv)).toContain(
      "取込履歴で確認"
    );
  });

  it("タイムアウトは件数を分けるよう促す", () => {
    expect(describeTransportError(new Error("504 Gateway Timeout"), csv)).toContain(
      "件数を分けて"
    );
  });

  it("分類できない例外は原文を括弧に入れて残す", () => {
    expect(describeTransportError(new Error("boom"))).toBe(
      "処理に失敗しました（boom）"
    );
  });

  it("Error 以外・null でも落ちない", () => {
    expect(describeTransportError(null)).toBe("処理に失敗しました");
    expect(describeTransportError("odd")).toBe("処理に失敗しました（odd）");
  });
});

describe("isFieldValidationError", () => {
  it("[field] 形式は入力エラー扱い", () => {
    expect(isFieldValidationError("[name] 名称を入力してください")).toBe(true);
  });

  it("マスタ未投入は入力に紐づくものとして扱う", () => {
    expect(isFieldValidationError("ポテンシャル数マスタが未投入です")).toBe(true);
  });

  it("権限・競合はトースト側", () => {
    expect(isFieldValidationError("管理者権限が必要です")).toBe(false);
    expect(isFieldValidationError(null)).toBe(false);
  });
});

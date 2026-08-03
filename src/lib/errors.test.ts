import { describe, expect, it } from "vitest";
import { isFieldValidationError, parseFieldError } from "./errors";

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

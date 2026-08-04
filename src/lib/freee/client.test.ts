import { describe, expect, it } from "vitest";
import { describeFreeeValidationError } from "./client";

/**
 * freee は 400 の本文に理由を日本語で入れてくる。
 * JSON をそのまま画面へ出すと読めないため、messages だけを取り出す。
 * 実際に「name が指定されていません。」がそのまま画面に出た（2026-08-04）。
 */
describe("describeFreeeValidationError", () => {
  it("errors[].messages を取り出す", () => {
    const body = JSON.stringify({
      status_code: 400,
      errors: [{ type: "validation", messages: ["name が指定されていません。"] }],
    });
    expect(describeFreeeValidationError(body, 400)).toBe("name が指定されていません。");
  });

  it("複数の理由は連ねる", () => {
    const body = JSON.stringify({
      errors: [
        { messages: ["name が指定されていません。"] },
        { messages: ["code が長すぎます。", "phone の形式が不正です。"] },
      ],
    });
    expect(describeFreeeValidationError(body, 400)).toBe(
      "name が指定されていません。 / code が長すぎます。 / phone の形式が不正です。"
    );
  });

  it("message だけの形にも対応する", () => {
    expect(describeFreeeValidationError(JSON.stringify({ message: "権限がありません" }), 403)).toBe(
      "権限がありません"
    );
  });

  it("JSON でなければ切り分け用に本文の先頭を残す", () => {
    expect(describeFreeeValidationError("<html>502 Bad Gateway</html>", 502)).toContain("502");
    expect(describeFreeeValidationError("", 500)).toContain("HTTP 500");
  });

  it("errors が空でも落ちない", () => {
    expect(describeFreeeValidationError(JSON.stringify({ errors: [] }), 400)).toContain("HTTP 400");
  });
});

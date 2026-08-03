import { describe, expect, it } from "vitest";
import { updateFinancialInfoSchema } from "./financial-info";

describe("updateFinancialInfoSchema", () => {
  it("expected_updated_at 未指定でも成功する（後方互換・ロックなし）", () => {
    const result = updateFinancialInfoSchema.safeParse({ bank_name: "テスト銀行" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBeUndefined();
  });

  it("expected_updated_at を文字列で受け取れる（楽観ロック用）", () => {
    const timestamp = "2026-08-01T00:00:00.000Z";
    const result = updateFinancialInfoSchema.safeParse({
      bank_name: "テスト銀行",
      expected_updated_at: timestamp,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBe(timestamp);
  });

  it("既存のバリデーション（金融機関コード桁数）は expected_updated_at 追加後も維持される", () => {
    const result = updateFinancialInfoSchema.safeParse({ bank_code: "12345" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["bank_code"]);
    }
  });
});

import { describe, expect, it } from "vitest";
import { leadActivityUpdateSchema } from "./lead-activities";

const VALID_ID = "c0000000-0000-0000-0000-000000000001";

describe("leadActivityUpdateSchema", () => {
  it("expected_updated_at 未指定でも成功する（後方互換・ロックなし）", () => {
    const result = leadActivityUpdateSchema.safeParse({ id: VALID_ID, note: "メモ" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBeUndefined();
  });

  it("expected_updated_at を文字列で受け取れる（楽観ロック用）", () => {
    const timestamp = "2026-08-01T00:00:00.000Z";
    const result = leadActivityUpdateSchema.safeParse({
      id: VALID_ID,
      note: "メモ",
      expected_updated_at: timestamp,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBe(timestamp);
  });
});

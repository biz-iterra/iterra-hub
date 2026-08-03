import { describe, expect, it } from "vitest";
import { campaignUpdateSchema } from "./campaigns";

const VALID_ID = "c0000000-0000-0000-0000-000000000001";

describe("campaignUpdateSchema", () => {
  it("expected_updated_at 未指定でも成功する（後方互換・ロックなし）", () => {
    const result = campaignUpdateSchema.safeParse({ id: VALID_ID, name: "キャンペーンA" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBeUndefined();
  });

  it("expected_updated_at を文字列で受け取れる（楽観ロック用）", () => {
    const timestamp = "2026-08-01T00:00:00.000Z";
    const result = campaignUpdateSchema.safeParse({
      id: VALID_ID,
      name: "キャンペーンA",
      expected_updated_at: timestamp,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBe(timestamp);
  });

  it("end_date が start_date より前なら拒否する（既存の refine と両立する）", () => {
    const result = campaignUpdateSchema.safeParse({
      id: VALID_ID,
      start_date: "2026-08-10",
      end_date: "2026-08-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["end_date"]);
    }
  });
});

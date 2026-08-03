import { describe, expect, it } from "vitest";
import { leadCustomerActivityUpdateSchema } from "./leads";

const VALID_ID = "c0000000-0000-0000-0000-000000000001";
const VALID_ACTIVITY_TYPE_ID = "c0000000-0000-0000-0000-000000000002";

describe("leadCustomerActivityUpdateSchema", () => {
  it("expected_updated_at 未指定でも成功する（後方互換・ロックなし）", () => {
    const result = leadCustomerActivityUpdateSchema.safeParse({
      id: VALID_ID,
      detail: "資料をダウンロードした",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBeUndefined();
  });

  it("expected_updated_at を文字列で受け取れる（楽観ロック用）", () => {
    const timestamp = "2026-08-01T00:00:00.000Z";
    const result = leadCustomerActivityUpdateSchema.safeParse({
      id: VALID_ID,
      activity_type_id: VALID_ACTIVITY_TYPE_ID,
      expected_updated_at: timestamp,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expected_updated_at).toBe(timestamp);
  });
});

import { describe, expect, it } from "vitest";
import { birthDateSchema } from "./common";

describe("birthDateSchema", () => {
  it("過去の日付を受け付ける", () => {
    const result = birthDateSchema.safeParse("1990-04-15");
    expect(result.success).toBe(true);
  });

  it("未入力（null / undefined / 空文字）を許容する", () => {
    expect(birthDateSchema.safeParse(null).success).toBe(true);
    expect(birthDateSchema.safeParse(undefined).success).toBe(true);
    const empty = birthDateSchema.safeParse("");
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data).toBeNull();
  });

  it("未来の日付を拒否する（診断結果が算出できないため）", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const result = birthDateSchema.safeParse(future.toISOString().slice(0, 10));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("未来の日付");
    }
  });

  it("存在しない日付を拒否する", () => {
    const result = birthDateSchema.safeParse("2020-02-30");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("存在しない日付");
    }
  });

  it("日付形式でない文字列を拒否する", () => {
    for (const v of ["1990/04/15", "19900415", "1990-4-15", "abc"]) {
      expect(birthDateSchema.safeParse(v).success).toBe(false);
    }
  });

  it("うるう年の 2 月 29 日を受け付ける", () => {
    expect(birthDateSchema.safeParse("2000-02-29").success).toBe(true);
    expect(birthDateSchema.safeParse("2001-02-29").success).toBe(false);
  });
});

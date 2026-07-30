import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  calculateDefaultCloseDate,
  toDateInputValue,
} from "./expected-close-date";

describe("addMonthsClamped", () => {
  it("通常の日付は月だけ加算する", () => {
    const result = addMonthsClamped(new Date(2026, 6, 30), 1); // 2026-07-30
    expect(toDateInputValue(result)).toBe("2026-08-30");
  });

  it("1/31 + 1ヶ月は平年 2/28 にクランプする", () => {
    const result = addMonthsClamped(new Date(2026, 0, 31), 1); // 2026-01-31（2026年は平年）
    expect(toDateInputValue(result)).toBe("2026-02-28");
  });

  it("1/31 + 1ヶ月は閏年 2/29 にクランプする", () => {
    const result = addMonthsClamped(new Date(2028, 0, 31), 1); // 2028年は閏年
    expect(toDateInputValue(result)).toBe("2028-02-29");
  });

  it("12/15 + 3ヶ月は翌年の 3/15 になる（年またぎ）", () => {
    const result = addMonthsClamped(new Date(2026, 11, 15), 3); // 2026-12-15
    expect(toDateInputValue(result)).toBe("2027-03-15");
  });

  it("0ヶ月は今日のまま", () => {
    const result = addMonthsClamped(new Date(2026, 6, 30), 0);
    expect(toDateInputValue(result)).toBe("2026-07-30");
  });
});

describe("calculateDefaultCloseDate", () => {
  it("default_close_months が数値ならその月数後の YYYY-MM-DD を返す", () => {
    const today = new Date(2026, 6, 30);
    expect(calculateDefaultCloseDate(today, 1)).toBe("2026-08-30");
  });

  it("default_close_months が null なら null を返す（自動設定しない）", () => {
    const today = new Date(2026, 6, 30);
    expect(calculateDefaultCloseDate(today, null)).toBeNull();
  });

  it("default_close_months が undefined でも null を返す", () => {
    const today = new Date(2026, 6, 30);
    expect(calculateDefaultCloseDate(today, undefined)).toBeNull();
  });

  it("0ヶ月なら今日を返す", () => {
    const today = new Date(2026, 6, 30);
    expect(calculateDefaultCloseDate(today, 0)).toBe("2026-07-30");
  });
});

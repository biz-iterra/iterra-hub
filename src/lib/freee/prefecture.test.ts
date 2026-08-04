import { describe, expect, it } from "vitest";
import { freeePrefectureCode, freeePrefectureName } from "./prefecture";

/**
 * freee の都道府県コードは 0 始まり（0: 北海道）。1 始まりと取り違えると
 * 全県が 1 つずれるため、両端と往復を固定する。
 */
describe("freeePrefectureCode / freeePrefectureName", () => {
  it("0 が北海道、46 が沖縄県（0 始まり）", () => {
    expect(freeePrefectureName(0)).toBe("北海道");
    expect(freeePrefectureName(46)).toBe("沖縄県");
    expect(freeePrefectureCode("北海道")).toBe(0);
    expect(freeePrefectureCode("沖縄県")).toBe(46);
  });

  it("往復しても変わらない", () => {
    for (const name of ["東京都", "大阪府", "京都府", "神奈川県", "鹿児島県"]) {
      expect(freeePrefectureName(freeePrefectureCode(name)!)).toBe(name);
    }
  });

  it("範囲外・未設定は null", () => {
    expect(freeePrefectureName(-1)).toBeNull();
    expect(freeePrefectureName(47)).toBeNull();
    expect(freeePrefectureName(null)).toBeNull();
    expect(freeePrefectureName(undefined)).toBeNull();
  });

  it("判定できない名前は null（送らない）", () => {
    expect(freeePrefectureCode("東京")).toBeNull();
    expect(freeePrefectureCode("")).toBeNull();
    expect(freeePrefectureCode(null)).toBeNull();
    expect(freeePrefectureCode("  東京都  ")).toBe(12);
  });
});

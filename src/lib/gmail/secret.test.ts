import { describe, expect, it } from "vitest";
import { bearerMatches, safeEqual } from "./secret";

const SECRET = "cron-secret-for-unit-test";

describe("safeEqual", () => {
  it("同じ値なら true", () => {
    expect(safeEqual(SECRET, SECRET)).toBe(true);
  });

  it("違う値なら false", () => {
    expect(safeEqual(SECRET, "cron-secret-for-unit-tesX")).toBe(false);
  });

  it("長さが違っても例外にならず false", () => {
    expect(safeEqual(SECRET, "short")).toBe(false);
    expect(safeEqual("", SECRET)).toBe(false);
  });

  it("マルチバイトでも比較できる", () => {
    expect(safeEqual("合言葉", "合言葉")).toBe(true);
    expect(safeEqual("合言葉", "合言草")).toBe(false);
  });
});

describe("bearerMatches", () => {
  it("正しいトークンなら true", () => {
    expect(bearerMatches(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("スキーム名の大小は問わない", () => {
    expect(bearerMatches(`bearer ${SECRET}`, SECRET)).toBe(true);
    expect(bearerMatches(`BEARER ${SECRET}`, SECRET)).toBe(true);
  });

  it("前後の空白は無視する", () => {
    expect(bearerMatches(`Bearer   ${SECRET}  `, SECRET)).toBe(true);
  });

  it("違うトークンなら false", () => {
    expect(bearerMatches("Bearer wrong-value", SECRET)).toBe(false);
  });

  it("スキームが無い・違うなら false", () => {
    expect(bearerMatches(SECRET, SECRET)).toBe(false);
    expect(bearerMatches(`Basic ${SECRET}`, SECRET)).toBe(false);
  });

  it("ヘッダが無ければ false", () => {
    expect(bearerMatches(null, SECRET)).toBe(false);
    expect(bearerMatches(undefined, SECRET)).toBe(false);
    expect(bearerMatches("", SECRET)).toBe(false);
  });

  it("期待値が未設定なら、何を送っても false", () => {
    // 設定漏れのまま「空文字を送れば通る」状態にならないこと
    expect(bearerMatches("Bearer ", null)).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches("Bearer anything", undefined)).toBe(false);
  });

  it("Bearer だけで値が無ければ false", () => {
    expect(bearerMatches("Bearer", SECRET)).toBe(false);
    expect(bearerMatches("Bearer  ", SECRET)).toBe(false);
  });
});

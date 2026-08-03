import { describe, expect, it } from "vitest";
import { buildIlikePattern, sanitizeSearchTerm } from "./search-query";

/**
 * `.or()` フィルタ式（`col.ilike.value` を `,` `(` `)` で組む文法）を壊す文字と、
 * LIKE のワイルドカードを無害化できているかを確認する。
 */

describe("sanitizeSearchTerm", () => {
  it("PostgREST の or() 構文を壊す記号を空白に置き換える", () => {
    expect(sanitizeSearchTerm("a,b")).toBe("a b");
    expect(sanitizeSearchTerm("a(b)")).toBe("a b");
    expect(sanitizeSearchTerm("a.b")).toBe("a b");
  });

  it("LIKE のワイルドカード % _ を空白に置き換える", () => {
    expect(sanitizeSearchTerm("100%")).toBe("100");
    expect(sanitizeSearchTerm("a_b")).toBe("a b");
  });

  it("引用符とバックスラッシュも除去する", () => {
    expect(sanitizeSearchTerm(`a'b"c\\d`)).toBe("a b c d");
  });

  it("前後の空白を trim する", () => {
    expect(sanitizeSearchTerm("  テスト  ")).toBe("テスト");
  });

  it("null / undefined / 空文字は空文字にする", () => {
    expect(sanitizeSearchTerm(null)).toBe("");
    expect(sanitizeSearchTerm(undefined)).toBe("");
    expect(sanitizeSearchTerm("")).toBe("");
  });

  it("危険な記号だけの入力は空文字になる", () => {
    expect(sanitizeSearchTerm(",().%_")).toBe("");
  });
});

describe("buildIlikePattern", () => {
  it("前後一致のパターンを組み立てる", () => {
    expect(buildIlikePattern("テスト")).toBe("%テスト%");
  });

  it("危険な記号を除いた上でパターンを組み立てる", () => {
    expect(buildIlikePattern("a,b(c)")).toBe("%a b c%");
  });

  it("空入力・null・undefined は null を返す（検索条件を付けない判断に使う）", () => {
    expect(buildIlikePattern("")).toBeNull();
    expect(buildIlikePattern("   ")).toBeNull();
    expect(buildIlikePattern(null)).toBeNull();
    expect(buildIlikePattern(undefined)).toBeNull();
  });

  it("記号だけの入力も null を返す", () => {
    expect(buildIlikePattern("%_")).toBeNull();
  });
});

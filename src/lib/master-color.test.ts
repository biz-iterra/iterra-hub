import { describe, expect, it } from "vitest";
import { BADGE_COLOR_PALETTE, pickDefaultBadgeColor } from "./master-color";

describe("pickDefaultBadgeColor", () => {
  it("1 件も登録が無ければパレットの先頭を返す", () => {
    expect(pickDefaultBadgeColor([], "新規ステータス")).toBe(BADGE_COLOR_PALETTE[0]);
  });

  it("既に使われている色は避ける", () => {
    const used = [BADGE_COLOR_PALETTE[0], BADGE_COLOR_PALETTE[1]];
    expect(pickDefaultBadgeColor(used, "次のもの")).toBe(BADGE_COLOR_PALETTE[2]);
  });

  it("null や空文字が混ざっていても未使用扱いにしない", () => {
    const used = [null, undefined, "", BADGE_COLOR_PALETTE[0]];
    expect(pickDefaultBadgeColor(used, "次のもの")).toBe(BADGE_COLOR_PALETTE[1]);
  });

  it("大文字小文字が違うだけの色は同じ色として数える", () => {
    const used = [BADGE_COLOR_PALETTE[0].toLowerCase()];
    expect(pickDefaultBadgeColor(used, "次のもの")).toBe(BADGE_COLOR_PALETTE[1]);
  });

  it("形式が壊れている値は無視する（使用済みに数えない）", () => {
    // 「#XYZ」を使用済みとして数えると、空きがあるのに使い切ったと誤判定する
    const used = ["#XYZ", "red", "#12345"];
    expect(pickDefaultBadgeColor(used, "次のもの")).toBe(BADGE_COLOR_PALETTE[0]);
  });

  it("全色が埋まっていても必ず色を返し、同じ名前なら毎回同じ色になる", () => {
    const used = [...BADGE_COLOR_PALETTE];
    const first = pickDefaultBadgeColor(used, "はみ出したステータス");
    const second = pickDefaultBadgeColor(used, "はみ出したステータス");
    expect(BADGE_COLOR_PALETTE).toContain(first);
    expect(second).toBe(first);
  });

  it("パレットはすべて #RRGGBB 形式（DB の CHECK と Zod に合わせる）", () => {
    for (const color of BADGE_COLOR_PALETTE) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

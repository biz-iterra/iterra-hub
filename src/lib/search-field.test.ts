import { describe, expect, it } from "vitest";
import {
  initialSearchFieldState,
  reduceSearchField,
  shouldIgnoreKey,
  type SearchFieldEvent,
  type SearchFieldState,
} from "./search-field";

/**
 * 日本語入力（IME）の変換中に検索を走らせないこと。
 *
 * 「検索欄で変換していると入力が消える・確定できない」は**同じ指摘を何度も
 * 受けている**（2026-08-05）。画面ごとに書くのをやめて判断をここへ寄せたので、
 * 仕様はこのテストで固定する。**検索欄を足すときは必ずここを通すこと。**
 */

/** イベント列を流し、各段で親へ伝わった値を集める */
function run(events: SearchFieldEvent[], start = "") {
  let state: SearchFieldState = initialSearchFieldState(start);
  const notified: string[] = [];
  for (const e of events) {
    const next = reduceSearchField(state, e);
    state = next.state;
    if (next.notify !== null) notified.push(next.notify);
  }
  return { state, notified };
}

describe("reduceSearchField", () => {
  it("変換中は親へ伝えない。確定した値だけが伝わる", () => {
    // Chrome の順序: compositionstart → input(未確定)×n → compositionend
    const { notified } = run([
      { type: "compositionStart" },
      { type: "input", value: "k" },
      { type: "input", value: "か" },
      { type: "input", value: "かいしゃ" },
      { type: "compositionEnd", value: "会社" },
    ]);
    expect(notified).toEqual(["会社"]);
  });

  it("確定後に input が続いても、余計な検索を増やさない", () => {
    // ブラウザによっては compositionend の後に input が来る。
    // 同じ値なので待ち時間で 1 回にまとまる（呼び出し側が張り直すため）
    const { notified } = run([
      { type: "compositionStart" },
      { type: "input", value: "かいしゃ" },
      { type: "compositionEnd", value: "会社" },
      { type: "input", value: "会社" },
    ]);
    expect(notified).toEqual(["会社", "会社"]);
  });

  it("input が compositionend より先に来ても確定値が伝わる", () => {
    const { notified } = run([
      { type: "compositionStart" },
      { type: "input", value: "かいしゃ" },
      { type: "input", value: "会社" },
      { type: "compositionEnd", value: "会社" },
    ]);
    // 未確定分は伝わらず、確定値だけ
    expect(notified).toEqual(["会社"]);
  });

  it("変換中も表示は追従する（打った文字が消えない）", () => {
    const { state } = run([
      { type: "compositionStart" },
      { type: "input", value: "かい" },
    ]);
    expect(state.draft).toBe("かい");
    expect(state.composing).toBe(true);
  });

  it("確定すると変換中の印が下りる", () => {
    const { state } = run([
      { type: "compositionStart" },
      { type: "input", value: "かい" },
      { type: "compositionEnd", value: "貝" },
    ]);
    expect(state).toEqual({ draft: "貝", composing: false });
  });

  it("変換を伴わない入力はそのまま伝わる", () => {
    const { notified, state } = run([
      { type: "input", value: "a" },
      { type: "input", value: "ab" },
    ]);
    expect(notified).toEqual(["a", "ab"]);
    expect(state.composing).toBe(false);
  });

  it("変換を続けて 2 回行うと、確定のたびに伝わる", () => {
    const { notified } = run([
      { type: "compositionStart" },
      { type: "input", value: "かぶ" },
      { type: "compositionEnd", value: "株式" },
      { type: "compositionStart" },
      { type: "input", value: "株式がいしゃ" },
      { type: "compositionEnd", value: "株式会社" },
    ]);
    expect(notified).toEqual(["株式", "株式会社"]);
  });

  it("変換を取り消して空で確定しても伝わる（絞り込みが戻る）", () => {
    const { notified, state } = run([
      { type: "compositionStart" },
      { type: "input", value: "かい" },
      { type: "compositionEnd", value: "" },
    ]);
    expect(notified).toEqual([""]);
    expect(state.draft).toBe("");
  });
});

describe("shouldIgnoreKey", () => {
  it("変換を確定させた Enter は無視する", () => {
    expect(shouldIgnoreKey({ isComposing: true, composing: false })).toBe(true);
  });

  it("変換中のキーは無視する（候補の選択と衝突する）", () => {
    expect(shouldIgnoreKey({ isComposing: false, composing: true })).toBe(true);
  });

  it("変換に関係ないキーは通す", () => {
    expect(shouldIgnoreKey({ isComposing: false, composing: false })).toBe(false);
  });
});

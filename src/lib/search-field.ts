/**
 * 検索欄の判断。**日本語入力（IME）の扱いをここに集める。**
 *
 * 変換中（`compositionstart` 〜 `compositionend`）は、まだ確定していない文字が
 * 入力欄の value に入る。それで検索すると**結果の再描画が変換中の入力を壊す**
 * （「かいしゃ」と打っている途中で「か」「かい」で検索が走り、変換が中断される）。
 *
 * 同じ不具合を画面ごとに繰り返し出していたため、判断を 1 か所へ集めた
 * （2026-08-05）。React に依存しない純粋な関数にしてあるのは、
 * **この仕様をテストで固定する**ため（`useSearchField` は薄い入れ物）。
 */

export type SearchFieldState = {
  /** 入力欄に見せる値。変換中も追従させる（打った文字が消えては困る） */
  draft: string;
  /** 変換中か */
  composing: boolean;
};

export type SearchFieldEvent =
  | { type: "input"; value: string }
  | { type: "compositionStart" }
  | { type: "compositionEnd"; value: string };

export type SearchFieldTransition = {
  state: SearchFieldState;
  /**
   * 親へ伝える値。**null なら伝えない**（変換中）。
   * 非 null なら待ち時間を張り直してから伝える。
   */
  notify: string | null;
};

export function initialSearchFieldState(value: string): SearchFieldState {
  return { draft: value, composing: false };
}

export function reduceSearchField(
  state: SearchFieldState,
  event: SearchFieldEvent
): SearchFieldTransition {
  switch (event.type) {
    case "compositionStart":
      // 変換に入る前に張った待ち時間が残っていると変換中に発火するので、
      // notify を null にして呼び出し側にタイマーを落とさせる
      return { state: { draft: state.draft, composing: true }, notify: null };

    case "input":
      // **変換中は伝えない。** 確定は compositionEnd で拾う
      return {
        state: { ...state, draft: event.value },
        notify: state.composing ? null : event.value,
      };

    case "compositionEnd":
      // **確定した値で検索する。** ブラウザによって input と compositionEnd の
      // 順序が違うため、ここでも値を拾って必ず伝わるようにする
      return {
        state: { draft: event.value, composing: false },
        notify: event.value,
      };
  }
}

/**
 * キー操作を無視すべきか。
 *
 * **変換を確定させた Enter を候補の確定に使わせない**（二重に反応する）。
 * `isComposing` は KeyboardEvent が持つ値で、変換を確定させた Enter の
 * keydown で true になる。`composing` はこちらが持っている変換中の印で、
 * 変換中の矢印キー（候補の選択）も拾わないために併せて見る。
 */
export function shouldIgnoreKey(params: {
  isComposing: boolean;
  composing: boolean;
}): boolean {
  return params.isComposing || params.composing;
}

"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  CompositionEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  initialSearchFieldState,
  reduceSearchField,
  shouldIgnoreKey,
  type SearchFieldEvent,
  type SearchFieldState,
} from "@/lib/search-field";

/**
 * 検索欄の共通の振る舞い。**検索欄は必ずこれを通すこと。**
 *
 * **生の `<input>` に自前で `onChange` を書かない。** 日本語入力の変換中に
 * 検索が走り、結果の再描画で入力が壊れる。同じ不具合を画面ごとに繰り返し
 * 出していたため、判断を `src/lib/search-field.ts` へ集めた（2026-08-05）。
 *
 * 仕様（テストは `src/lib/search-field.test.ts`）:
 * - 変換中は親へ伝えない
 * - **確定したら検索する**（確定時に待ち時間を張り直す）
 * - Enter は待たずに検索する。ただし**変換を確定させた Enter は無視する**
 *
 * このフックが持つのはタイマーと React の配線だけ。判断は入れないこと。
 */

/**
 * 入力が止まってから親へ伝えるまでの時間。
 *
 * 一覧の条件は URL に載せてサーバーから取り直すため、1 文字ごとに伝えると
 * 打っている途中で再描画が挟まり、入力が取りこぼされる。
 * 打鍵の間隔より長く、待たされたと感じない程度に置く。
 */
export const SEARCH_DEBOUNCE_MS = 300;

export type SearchFieldOptions = {
  /** 親が持つ確定値（URL のクエリなど） */
  value: string;
  /** 確定値を親へ渡す。**変換中には呼ばれない** */
  onChange: (value: string) => void;
  /**
   * 待ち時間。検索そのものの待ち時間を呼び出し側が既に持っている場合は
   * 0 にして「確定したら即座に渡す」形にする（二重に待たせない）
   */
  debounceMs?: number;
};

export function useSearchField({
  value,
  onChange,
  debounceMs = SEARCH_DEBOUNCE_MS,
}: SearchFieldOptions) {
  // 表示は手元の値、親への通知は遅らせる。
  // 打っている最中に外から値を戻されないよう、直前に見た外の値を覚えておき、
  // それが変わったときだけ手元の値を合わせる（リセットやブラウザの戻り）。
  // effect ではなくレンダー中に調整するのは React の推奨する形
  // （props が変わったときの state 調整）で、余分な再描画が挟まらない
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  /** 変換中かどうかは **ref で持つ**（再描画を挟むと変換が途切れる） */
  const stateRef = useRef<SearchFieldState>(initialSearchFieldState(value));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const dispatch = (event: SearchFieldEvent) => {
    const { state, notify } = reduceSearchField(stateRef.current, event);
    stateRef.current = state;
    setDraft(state.draft);
    // 前の待ち時間は必ず落とす。変換に入った直後に発火させないため
    clearTimer();
    if (notify === null) return;
    if (debounceMs <= 0) onChange(notify);
    else timer.current = setTimeout(() => onChange(notify), debounceMs);
  };

  /** 手元の値を親へ渡す。immediate なら待たない（クリア・Enter） */
  const commit = (next: string, immediate = false) => {
    stateRef.current = { ...stateRef.current, draft: next };
    setDraft(next);
    clearTimer();
    if (immediate) onChange(next);
    else timer.current = setTimeout(() => onChange(next), debounceMs);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) =>
    dispatch({ type: "input", value: e.target.value });

  const handleCompositionStart = () => dispatch({ type: "compositionStart" });

  const handleCompositionEnd = (e: CompositionEvent<HTMLInputElement>) =>
    dispatch({ type: "compositionEnd", value: e.currentTarget.value });

  /**
   * 変換に伴うキー操作か。**独自の onKeyDown を持つ入力欄は、必ず先頭で
   * これを見て早期 return する**（変換を確定させた Enter で候補が選ばれてしまう）。
   *
   * 高階関数（ハンドラを包んで返す形）にしないのは、それだと JSX の中で
   * 呼ぶことになり、**レンダー中に ref を読む**形になるため（lint が検出する）。
   */
  const isComposingKey = (e: ReactKeyboardEvent<HTMLInputElement>) =>
    shouldIgnoreKey({
      isComposing: e.nativeEvent.isComposing,
      composing: stateRef.current.composing,
    });

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (isComposingKey(e)) return;
    // 確定した語で待たずに検索する
    if (e.key === "Enter") commit(e.currentTarget.value, true);
  };

  /** 入力欄へそのまま渡す属性。独自の onKeyDown が要る場合は使わない */
  const inputProps = {
    value: draft,
    onChange: handleChange,
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    onKeyDown: handleKeyDown,
  };

  return {
    draft,
    commit,
    isComposingKey,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    inputProps,
  };
}

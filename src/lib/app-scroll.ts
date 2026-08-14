/**
 * 画面のスクロールを扱う共通処理。
 *
 * **この CRM で縦にスクロールするのは `<main>` であって `window` ではない。**
 * 画面の外枠（`AppShell`）が `h-screen overflow-hidden` で、その中の
 * `<main>` だけが `overflow-y: auto` になっている。サイドバーとヘッダーを
 * 常に見える位置へ固定するための構成。
 *
 * このため `window.scrollTo()` も `document.body.style.overflow` も効かない。
 * 効かないことに気づきにくい（エラーも出ず、何も起きないだけ）ので、
 * 先頭へ戻す・背面を止めるといった操作はここを通す。
 */

/** `<main>` に付ける id。AppShell と本ファイルの両方が参照する */
export const APP_SCROLLER_ID = "app-scroller";

/**
 * 実際にスクロールしている要素を返す。
 *
 * ログイン画面のように AppShell の外にある画面では見つからない。
 * その場合は文書がスクローラなので `document.scrollingElement` を返す。
 */
export function getAppScroller(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    document.getElementById(APP_SCROLLER_ID) ??
    (document.scrollingElement as HTMLElement | null)
  );
}

/**
 * 本文の先頭へ戻す。
 *
 * 入力エラーを画面の上に出したときに使う。エラー文がスクロール位置より
 * 上にあると、保存を押しても何も起きていないように見えるため。
 */
export function scrollAppToTop(behavior: ScrollBehavior = "smooth") {
  getAppScroller()?.scrollTo({ top: 0, behavior });
}

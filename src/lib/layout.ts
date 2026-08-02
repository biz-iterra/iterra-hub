/**
 * ページコンテナの最大幅。
 *
 * ページごとに 1280 / 1200 / 960 / 800 がばらばらに書かれていたため、
 * 種別ごとの値をここに集約する。新しいページもこの定数を使うこと。
 *
 * 種別で分けている理由:
 *   一覧   … 列が多く、横スクロールを増やしたくないので幅を制限しない
 *   詳細   … 2 カラム構成が主。広すぎると視線移動が大きくなる
 *
 * 余白は layout.tsx の p-6 が持つ。ページ側で padding を足すと
 * 一覧と詳細で余白がずれるため、コンテナには padding を入れない。
 */

import type { CSSProperties } from "react";

/** 詳細ページ */
export const DETAIL_MAX_WIDTH = 1280;

/**
 * 編集・新規作成などのフォームページ。
 *
 * **詳細ページと同じ幅にしてある。** 以前はフォームだけ 960 に絞っていたが、
 * 詳細から編集へ移るたびに本文が縮んで、同じものを見ている感覚が切れていた。
 * 1 行が伸びすぎないかは各フォームの grid（2 列）が受け持つ。
 */
export const FORM_MAX_WIDTH = DETAIL_MAX_WIDTH;

/** 詳細ページのコンテナ */
export const detailContainerStyle: CSSProperties = {
  maxWidth: DETAIL_MAX_WIDTH,
  margin: "0 auto",
};

/** フォームページのコンテナ */
export const formContainerStyle: CSSProperties = {
  maxWidth: FORM_MAX_WIDTH,
  margin: "0 auto",
};

/**
 * 詳細ページ本文の 2 カラム。右カラムには関連エンティティの一覧が入る。
 *
 * 比率は 8:2。右に最小幅を与えているのは、法人名や氏名が長いときに
 * 関連リストが潰れて読めなくなるのを防ぐため。
 * 左に minmax(0, …) を指定しないと、中の表がはみ出したときに
 * グリッドが押し広げられて右カラムが消える。
 */
export const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 8fr) minmax(280px, 2fr)",
  gap: "1.5rem",
  alignItems: "start",
};

/**
 * セクション内の項目グリッド。
 *
 * 全セクションを 2 列で揃える。ページをまたいでラベルの位置が合い、
 * 値が長いときも折り返しが起きにくい。
 * メモ・URL・説明のような長い値は InfoField の full で全幅にする。
 */
export const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "1rem",
};

/**
 * DetailSection を縦に積むときの間隔。
 *
 * DetailSection は見出しがカードの外にあるため、セクション間が狭いと
 * 見出しが直前のカードに属して見える。見出し下の余白（0.5rem）より
 * はっきり広い値を取り、どのカードの見出しかが一目で分かるようにする。
 *
 * ページごとに 1.25rem / 1.5rem / 指定なし が混在していたのでここに寄せる。
 */
export const sectionStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
};

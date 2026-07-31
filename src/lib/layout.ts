/**
 * ページコンテナの最大幅。
 *
 * ページごとに 1280 / 1200 / 960 / 800 がばらばらに書かれていたため、
 * 種別ごとの値をここに集約する。新しいページもこの定数を使うこと。
 *
 * 種別で分けている理由:
 *   一覧   … 列が多く、横スクロールを増やしたくないので幅を制限しない
 *   詳細   … 2 カラム構成が主。広すぎると視線移動が大きくなる
 *   フォーム … 1 行が長いと読みづらく、入力欄も間延びする
 *
 * 余白は layout.tsx の p-6 が持つ。ページ側で padding を足すと
 * 一覧と詳細で余白がずれるため、コンテナには padding を入れない。
 */

import type { CSSProperties } from "react";

/** 詳細ページ */
export const DETAIL_MAX_WIDTH = 1280;

/** 編集・新規作成などのフォームページ */
export const FORM_MAX_WIDTH = 960;

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

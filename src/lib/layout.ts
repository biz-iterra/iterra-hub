/**
 * ページ共通のレイアウト。
 *
 * ページごとに 1280 / 1200 / 960 / 800 がばらばらに書かれていたため、
 * 種別ごとの指定をここに集約する。新しいページもこの定数を使うこと。
 *
 * **実体は globals.css の @layer components にある CSS クラス。**
 * 以前は CSSProperties を返していたが、style 属性にはメディアクエリを
 * 書けず、どのページも固定 2 カラムのままだった。レスポンシブにするため
 * クラス名を配る形へ変えている。値を変えるときは globals.css を編集する。
 *
 * 余白は layout.tsx の main が持つ。ページ側で padding を足すと
 * 一覧と詳細で余白がずれるため、コンテナには padding を入れない。
 */

/**
 * 詳細ページのコンテナ。
 *
 * 一覧は列が多く横スクロールを増やしたくないので幅を制限しない。
 * 詳細は 2 カラム構成が主で、広すぎると視線移動が大きくなるため絞る。
 */
export const detailContainerClass = "page-container-detail";

/**
 * 編集・新規作成などのフォームページのコンテナ。
 *
 * **詳細ページと同じ幅にしてある。** 以前はフォームだけ 960 に絞っていたが、
 * 詳細から編集へ移るたびに本文が縮んで、同じものを見ている感覚が切れていた。
 * 1 行が伸びすぎないかは各フォームの field-grid が受け持つ。
 */
export const formContainerClass = "page-container-form";

/** 詳細ページ本文の 2 カラム（lg 未満では 1 カラム） */
export const detailGridClass = "detail-grid";

/** セクション内の項目グリッド（sm 未満では 1 列） */
export const fieldGridClass = "field-grid";

/** 項目グリッドの 3 列版（sm で 2 列、lg で 3 列） */
export const fieldGrid3Class = "field-grid-3";

/**
 * 項目数が可変で列の意味が固定されていないグリッド。
 * 住所・財務情報・SNS アカウントなど、幅に合わせて列数が変わってよいもの。
 */
export const autoGridClass = "auto-grid";

/** DetailSection を縦に積むときの間隔 */
export const sectionStackClass = "section-stack";

/** ページ見出しの行（狭幅で折り返す） */
export const pageHeaderRowClass = "page-header-row";

/** 一覧上部の検索・フィルタ行（md 未満では縦積み） */
export const filterBarClass = "filter-bar";

/** 「情報 / 補助 / 操作」の 3 列で並べる行（md 未満では縦積み） */
export const entryRowClass = "entry-row";

/** フォームの操作ボタン行。保存・キャンセルだけのもの（sm 未満では全幅の縦積み） */
export const formActionsClass = "form-actions";

/** フォームの操作ボタン行。左に削除を置くもの（sm 未満では全幅の縦積み） */
export const formFooterClass = "form-footer";

/** 表の横スクロール領域（続きがあることを端のグラデーションで示す） */
export const tableScrollClass = "table-scroll";

/**
 * カンバンの列の色。
 *
 * **色はマスタの `color` から作る。** 並び順のインデックスから割り当てると、
 * ステージを 1 つ足しただけで既存の列の色がずれ、同じステージが画面によって
 * 別の色になる（バッジ側は既に color を使っているので、そこともずれる）。
 *
 * マスタの色は白文字が乗る前提の濃色なので、
 * 薄い背景は同じ色に透明度を掛けて作る。
 */

export type KanbanColor = {
  /** 見出しのバッジなど、白文字を乗せる面 */
  solid: string;
  /** 列全体の下地 */
  bg: string;
  /** 下地の上に置く文字 */
  text: string;
};

/** マスタに色が無いときの色。淡いグレーで「未設定」と分かるようにする */
const FALLBACK: KanbanColor = {
  solid: "#8A8A94",
  bg: "rgba(138, 138, 148, 0.10)",
  text: "#5A5A66",
};

const HEX = /^#[0-9a-f]{6}$/i;

export function kanbanColorFrom(hex: string | null | undefined): KanbanColor {
  if (!hex || !HEX.test(hex)) return FALLBACK;

  return {
    solid: hex,
    // 8 桁 hex の末尾 2 桁が不透明度。0x1F ≒ 12%
    bg: `${hex}1F`,
    text: hex,
  };
}

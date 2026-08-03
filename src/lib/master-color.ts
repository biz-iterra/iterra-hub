/**
 * マスタのバッジ色を自動で決める。
 *
 * `color` は任意入力だが、空のまま保存すると表示側が名前のハッシュから
 * 色を選ぶことになり、同じ意味の値でも画面ごとに違う色に見えうる。
 * 保存時点で確定させて DB を正本にするために、未指定ならここで割り当てる。
 *
 * 色そのものは `src/components/ui/badges.tsx` の PROGRESSION_PALETTE の
 * ソリッド色と揃えてある。片方だけ増やすと自動付与された色だけが
 * 既存バッジから浮くので、両方を同じ作業内で直すこと。
 */

/** 自動付与に使う色。進行の段階（開始 → 完了）順に並べてある */
export const BADGE_COLOR_PALETTE = [
  "#2563EB", // 開始（info blue）
  "#0F766E", // 初期進行（teal）
  "#B88A2E", // 中期（amber）
  "#B85A3F", // 後期（soleil）
  "#4D7A65", // 完了・最終（sage）
  "#7C3AED", // 以降は区別用の補助色（violet）
  "#B03A2E", // 補助色（red）
  "#0E7490", // 補助色（cyan）
] as const;

/** 大文字小文字の違いで「別の色」と数えないための正規化 */
function normalize(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(trimmed) ? trimmed : null;
}

/** 文字列から安定した数値を作る（同じ名前なら毎回同じ色になるように） */
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * 同じマスタ内でまだ使われていない色を返す。
 *
 * 全色が埋まっている場合は名前から決める。ランダムにしないのは、
 * 保存し直すたびに色が変わると「なぜ変わったのか」が説明できないため。
 *
 * @param existingColors 同じテーブルに登録済みの色（null 混在可）
 * @param seed 名前やコードなど、その行を安定して識別できる文字列
 */
export function pickDefaultBadgeColor(
  existingColors: (string | null | undefined)[],
  seed: string
): string {
  const used = new Set(
    existingColors.map(normalize).filter((c): c is string => c !== null)
  );

  const unused = BADGE_COLOR_PALETTE.find((c) => !used.has(c.toUpperCase()));
  if (unused) return unused;

  return BADGE_COLOR_PALETTE[hash(seed) % BADGE_COLOR_PALETTE.length];
}

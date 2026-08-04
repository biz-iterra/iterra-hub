/**
 * 事業者が「個人事業主」かどうかの判定。
 *
 * `corporate_types` は `code` を持たず名称だけのマスタなので、判定は名称の一致になる。
 * 画面ごとに文字列を書くとマスタの改名でずれるため、ここに集約する
 * （2026-08-04 時点で新規作成・編集・詳細の 3 箇所に同じ比較が散っていた）。
 *
 * **個人事業主のときに隠すもの**（database-design.md §22.2.1 の続き）:
 *   - 法人番号（個人事業主は持たない。既存の扱い）
 *   - 代表者名・担当者（本人しかいないため、別に持つ意味がない）
 *   - 法人格の表示（詳細画面。「個人事業主」と出しても情報が増えない）
 *
 * **フォームの法人格の選択欄は隠さない。** そこで個人事業主を選ぶため、
 * 隠すと個人事業主に切り替えられなくなる。
 */
export const SOLE_PROPRIETOR_TYPE_NAME = "個人事業主";

export function isSoleProprietorTypeName(name: string | null | undefined): boolean {
  return (name ?? "").trim() === SOLE_PROPRIETOR_TYPE_NAME;
}

/** 法人格の選択肢（value/label）から、選択中の値が個人事業主かを判定する */
export function isSoleProprietorSelected(
  options: { value: string; label: string }[],
  selectedId: string | null | undefined
): boolean {
  if (!selectedId) return false;
  return isSoleProprietorTypeName(
    options.find((o) => o.value === selectedId)?.label
  );
}

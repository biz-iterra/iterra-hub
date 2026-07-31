/**
 * 法人セレクトの選択肢を組み立てる。
 *
 * 名刺取込の遡及作成で法人が数千件規模になり、一覧取得の上限（perPage）から
 * 現在紐付いている法人が漏れることがある。漏れたまま保存すると
 * 「未選択」として送られ、既存の紐付けが消える。
 *
 * 現在値は必ず選択肢に含める。
 */

export type SelectOption = { value: string; label: string };

type CompanyLike = { id: string; name: string };

export function buildCompanyOptions(
  rows: CompanyLike[],
  current: CompanyLike | null | undefined
): SelectOption[] {
  const options = rows.map((c) => ({ value: c.id, label: c.name }));

  if (current && !options.some((o) => o.value === current.id)) {
    // 先頭に置く。一覧の並びより「今の値」が見つかることを優先する
    options.unshift({ value: current.id, label: current.name });
  }

  return options;
}

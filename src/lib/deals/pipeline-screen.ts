/**
 * パイプラインと画面の対応（T-0073）。
 *
 * 商談の一覧は**パイプラインごとに画面が分かれている**。
 *
 *   営業     → /sales        セールス
 *   仕入れ   → /procurement  プロキュアメント
 *   業務委託 → /partnership  パートナーシップ
 *
 * **商談の詳細（`/deals/{id}`）は分けていない。** 分けると契約・
 * プロジェクト・リード・横断検索・活動履歴のリンク元が全部
 * パイプラインを知る必要が出るため。詳細から一覧へ戻るときだけ、
 * その商談のパイプラインに応じた画面を選ぶ。
 *
 * 対応の正本は DB の `pipeline_types.screen_key`。ここは受け取った値を
 * パスに変えるだけで、**slug や名前で判定しない**。
 */

export type PipelineScreenKey = "sales" | "procurement" | "partnership";

const SCREEN_PATH: Record<PipelineScreenKey, string> = {
  sales: "/sales",
  procurement: "/procurement",
  partnership: "/partnership",
};

const SCREEN_LABEL: Record<PipelineScreenKey, string> = {
  sales: "セールス",
  procurement: "プロキュアメント",
  partnership: "パートナーシップ",
};

function isScreenKey(value: string | null | undefined): value is PipelineScreenKey {
  return value === "sales" || value === "procurement" || value === "partnership";
}

/**
 * 一覧へ戻るときのパス。
 *
 * 画面を持たないパイプライン（`screen_key` が NULL）はセールスへ返す。
 * 行き止まりを作らないため。
 */
export function pipelineListPath(screenKey: string | null | undefined): string {
  return isScreenKey(screenKey) ? SCREEN_PATH[screenKey] : "/sales";
}

/** 「〜一覧に戻る」の呼び名 */
export function pipelineListLabel(screenKey: string | null | undefined): string {
  return isScreenKey(screenKey) ? SCREEN_LABEL[screenKey] : "セールス";
}

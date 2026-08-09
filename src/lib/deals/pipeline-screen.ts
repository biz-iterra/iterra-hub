/**
 * パイプラインと画面の対応（T-0073）。
 *
 * ディールの一覧は**パイプラインごとに画面が分かれている**。
 *
 *   営業     → /sales        セールス
 *   仕入れ   → /procurement  プロキュアメント
 *   業務委託 → /partnership  パートナーシップ
 *
 * **ディールの詳細（`/deals/{id}`）は分けていない。** 分けると契約・
 * プロジェクト・リード・横断検索・活動履歴のリンク元が全部
 * パイプラインを知る必要が出るため。詳細から一覧へ戻るときだけ、
 * そのディールのパイプラインに応じた画面を選ぶ。
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

/** URL のクエリ等から来た文字列を画面キーにする。知らない値は null */
export function parseScreenKey(
  value: string | string[] | null | undefined
): PipelineScreenKey | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return isScreenKey(raw) ? raw : null;
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

/**
 * 新規作成へのパス。
 *
 * **どのパイプラインで作るかは画面が決める**（T-0079）。以前は作成画面に
 * パイプラインの選択欄があったが、セールス / プロキュアメント /
 * パートナーシップのそれぞれから作る今は選ばせる意味が無い。
 */
export function pipelineNewPath(screenKey: string | null | undefined): string {
  const key = isScreenKey(screenKey) ? screenKey : "sales";
  return `/deals/new?pipeline=${key}`;
}

/** 「〜一覧に戻る」の呼び名 */
export function pipelineListLabel(screenKey: string | null | undefined): string {
  return isScreenKey(screenKey) ? SCREEN_LABEL[screenKey] : "セールス";
}

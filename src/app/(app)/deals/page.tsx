import { redirect } from "next/navigation";

/**
 * ディール一覧は**パイプラインごとの画面に分けた**（T-0073）。
 *
 *   営業     → /sales        セールス
 *   仕入れ   → /procurement  プロキュアメント
 *   業務委託 → /partnership  パートナーシップ
 *
 * ここは既存のブックマークとリンクの逃がし先。**ディールの詳細
 * （`/deals/{id}`）は分けていない**ので、そちらはそのまま動く
 * （分けると契約・プロジェクト・リード・横断検索・活動履歴の
 * リンク元が全部パイプラインを知る必要が出る）。
 *
 * クエリは引き継ぐ。`?pipelineId=` で来たときだけ、そのパイプラインの
 * 画面へ送る。
 */

const SCREEN_PATH: Record<string, string> = {
  sales: "/sales",
  procurement: "/procurement",
  partnership: "/partnership",
};

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // pipelineId が指定されていれば、その画面へ送る
  const rawPipelineId = Array.isArray(params.pipelineId)
    ? params.pipelineId[0]
    : params.pipelineId;

  let path = "/sales";
  if (rawPipelineId) {
    const { getPipelineTypes } = await import("@/actions/masters");
    const { data } = await getPipelineTypes();
    const hit = (data ?? []).find((p) => p.id === rawPipelineId);
    if (hit?.screen_key && SCREEN_PATH[hit.screen_key]) {
      path = SCREEN_PATH[hit.screen_key];
    }
  }

  // 表示条件（ビュー・並び順・絞り込み）は引き継ぐ。pipelineId だけ落とす
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "pipelineId" || value === undefined) continue;
    query.set(key, Array.isArray(value) ? (value[0] ?? "") : value);
  }
  const qs = query.toString();

  redirect(qs ? `${path}?${qs}` : path);
}

import { getDealsForKanban, getDeals } from "@/actions/deals";
import { getPipelineTypes, getDealStages, getDealStatuses } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { DealsView } from "@/app/(app)/deals/deals-view";

/**
 * パイプライン 1 つ分の商談画面（T-0073）。
 *
 * **セールス / プロキュアメント / パートナーシップで画面を分ける。**
 * 性質が異なる（顧客への営業 / 仕入れ先との取引 / 委託先との関係）ので、
 * 1 つの画面でパイプラインを切り替える形をやめた。
 *
 * `/progress/*`（リードの進捗画面）と同じ作りにしてある。各ページは
 * `screenKey` と見出しを渡すだけで、中身はここが持つ。
 *
 * **どのパイプラインかは `pipeline_types.screen_key` で引く。**
 * slug は自動採番になり「引くな」とされている（`20260805000019`）。
 */
export async function DealPipelineWorkspace({
  screenKey,
  title,
  description,
  searchParams,
}: {
  screenKey: "sales" | "procurement" | "partnership";
  title: string;
  description: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const state = parseSearchParams(searchParams, LIST_FILTER_KEYS.deals);

  const { data: pipelineTypes } = await getPipelineTypes();
  const pipelines = pipelineTypes ?? [];
  const pipeline = pipelines.find((p) => p.screen_key === screenKey) ?? null;

  if (!pipeline) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1
          style={{
            color: "var(--color-text-title)",
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "0.75rem",
          }}
        >
          {title}
        </h1>
        <p style={{ color: "var(--color-text-body)" }}>
          この画面に対応するパイプラインが見つかりません。マスタ管理でパイプラインを確認してください。
        </p>
      </div>
    );
  }

  const [kanbanResult, dealsResult, stagesResult, statusesResult, usersResult] =
    await Promise.all([
      getDealsForKanban(pipeline.id),
      getDeals({
        // **テーブルもパイプラインで絞る**（T-0076）。
        // 以前はカンバンだけ絞られ、テーブルは全パイプラインが混ざっていた
        pipelineTypeId: pipeline.id,
        search: state.filters.search || undefined,
        stageId: state.filters.stageId || undefined,
        statusId: state.filters.statusId || undefined,
        ownerUserId: state.filters.ownerUserId || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: state.page,
        sortField: state.sort?.field,
        sortDirection: state.sort?.direction,
      }),
      getDealStages(pipeline.id),
      getDealStatuses(pipeline.id),
      getCrmUsers(),
    ]);

  return (
    <DealsView
      title={title}
      description={description}
      // 画面がパイプラインを決めるので、切り替えの選択欄は出さない
      pipelines={[pipeline]}
      defaultPipelineId={pipeline.id}
      showPipelineSelector={false}
      initialKanbanData={kanbanResult.data ?? null}
      initialListData={dealsResult.data}
      stages={stagesResult.data ?? []}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
    />
  );
}

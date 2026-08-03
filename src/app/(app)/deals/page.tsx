import { getDealsForKanban, getDeals } from "@/actions/deals";
import { getPipelineTypes, getDealStages, getDealStatuses } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { DealsView } from "./deals-view";
import type {
  DealWithRelations,
  SortedColoredRef,
} from "@/types/relations";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.deals);

  const { data: pipelineTypes } = await getPipelineTypes();
  const pipelines = pipelineTypes ?? [];
  // URL で指定されたパイプラインを優先する。存在しない ID を渡されたら先頭に落とす
  const requestedPipelineId = state.filters.pipelineId;
  const defaultPipelineId =
    (requestedPipelineId && pipelines.some((p) => p.id === requestedPipelineId)
      ? requestedPipelineId
      : pipelines[0]?.id) ?? null;

  type KanbanData = {
    stages: { stage: SortedColoredRef; deals: DealWithRelations[] }[];
    statuses: { status: SortedColoredRef; deals: DealWithRelations[] }[];
  } | null;

  const [
    kanbanResult,
    dealsResult,
    stagesResult,
    statusesResult,
    usersResult,
  ] = await Promise.all([
    defaultPipelineId ? getDealsForKanban(defaultPipelineId) : Promise.resolve({ data: null }),
    getDeals({
      search: state.filters.search || undefined,
      stageId: state.filters.stageId || undefined,
      statusId: state.filters.statusId || undefined,
      ownerUserId: state.filters.ownerUserId || undefined,
      perPage: DEFAULT_PAGE_SIZE,
      page: state.page,
      sortField: state.sort?.field,
      sortDirection: state.sort?.direction,
    }),
    getDealStages(defaultPipelineId ?? undefined),
    getDealStatuses(defaultPipelineId ?? undefined),
    getCrmUsers(),
  ]);

  const kanbanData: KanbanData = kanbanResult.data ?? null;
  const listData = dealsResult.data;

  return (
    <DealsView
      pipelines={pipelines}
      defaultPipelineId={defaultPipelineId}
      initialKanbanData={kanbanData}
      initialListData={listData}
      stages={stagesResult.data ?? []}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
    />
  );
}

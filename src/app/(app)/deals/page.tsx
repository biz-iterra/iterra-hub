import { getDealsForKanban, getDeals } from "@/actions/deals";
import { getPipelineTypes, getDealStages, getDealStatuses } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { DealsView } from "./deals-view";

export default async function DealsPage() {
  const { data: pipelineTypes } = await getPipelineTypes();
  const pipelines = pipelineTypes ?? [];
  const defaultPipelineId = pipelines[0]?.id ?? null;

  type KanbanData = {
    stages: { stage: { id: string; name: string; sort_order: number }; deals: any[] }[];
    statuses: { status: { id: string; name: string; sort_order: number }; deals: any[] }[];
  } | null;

  const [
    kanbanResult,
    dealsResult,
    stagesResult,
    statusesResult,
    usersResult,
  ] = await Promise.all([
    defaultPipelineId ? getDealsForKanban(defaultPipelineId) : Promise.resolve({ data: null }),
    getDeals({ perPage: 50 }),
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

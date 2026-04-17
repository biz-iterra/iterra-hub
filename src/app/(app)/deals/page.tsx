import { getDealsForKanban, getDeals } from "@/actions/deals";
import { getPipelineTypes } from "@/actions/masters";
import { DealsView } from "./deals-view";

export default async function DealsPage() {
  const { data: pipelineTypes } = await getPipelineTypes();
  const pipelines = pipelineTypes ?? [];
  const defaultPipelineId = pipelines[0]?.id ?? null;

  type KanbanData = {
    stages: { stage: { id: string; name: string; sort_order: number }; deals: any[] }[];
    statuses: { status: { id: string; name: string; sort_order: number }; deals: any[] }[];
  } | null;

  let kanbanData: KanbanData = null;

  let listData: { items: any[]; count: number } | null = null;

  if (defaultPipelineId) {
    const { data } = await getDealsForKanban(defaultPipelineId);
    kanbanData = data;
  }

  const { data: dealsResult } = await getDeals({ perPage: 50 });
  listData = dealsResult;

  return (
    <DealsView
      pipelines={pipelines}
      defaultPipelineId={defaultPipelineId}
      initialKanbanData={kanbanData}
      initialListData={listData}
    />
  );
}

import { getLeads } from "@/actions/leads";
import {
  getLeadStages,
  getLeadStatuses,
  getLeadTemperatures,
  getLeadCategories,
} from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { LeadsView } from "./leads-view";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.leads);

  const [
    leadsResult,
    stagesResult,
    statusesResult,
    temperaturesResult,
    categoriesResult,
    usersResult,
    currentUserResult,
  ] = await Promise.all([
    getLeads({
      stage_id: state.filters.stageId || undefined,
      status_id: state.filters.statusId || undefined,
      category_id: state.filters.categoryId || undefined,
      temperature_id: state.filters.temperatureId || undefined,
      owner_user_id: state.filters.ownerUserId || undefined,
      keyword: state.filters.search || undefined,
      perPage: DEFAULT_PAGE_SIZE,
      page: state.page,
      sortField: state.sort?.field,
      sortDirection: state.sort?.direction,
    }),
    getLeadStages(),
    getLeadStatuses(),
    getLeadTemperatures(),
    getLeadCategories(),
    getCrmUsers(),
    getCurrentUser(),
  ]);

  return (
    <LeadsView
      initialData={leadsResult.data}
      stages={stagesResult.data ?? []}
      statuses={statusesResult.data ?? []}
      temperatures={temperaturesResult.data ?? []}
      categories={categoriesResult.data ?? []}
      users={usersResult.data ?? []}
      currentUserRole={currentUserResult.data?.role ?? "member"}
    />
  );
}

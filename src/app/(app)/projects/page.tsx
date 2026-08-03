import { getProjects, getProjectStatuses } from "@/actions/projects";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { ProjectsView } from "./projects-view";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.projects);

  const [projectsResult, statusesResult, usersResult, meResult] = await Promise.all([
    getProjects({
      statusId: state.filters.statusId || undefined,
      ownerUserId: state.filters.ownerUserId || undefined,
      search: state.filters.search || undefined,
      perPage: DEFAULT_PAGE_SIZE,
      page: state.page,
      sortField: state.sort?.field,
      sortDirection: state.sort?.direction,
    }),
    getProjectStatuses(),
    getCrmUsers(),
    getCurrentUser(),
  ]);
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";
  return (
    <ProjectsView
      initialData={projectsResult.data}
      statuses={statusesResult.data ?? []}
      users={usersResult.data ?? []}
      isManagerOrAbove={isManagerOrAbove}
    />
  );
}

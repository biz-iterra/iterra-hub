import { getCampaigns } from "@/actions/campaigns";
import { getCurrentUser } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { CampaignsView } from "./campaigns-view";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.campaigns);

  const [campaignsResult, currentUserResult] = await Promise.all([
    getCampaigns({
      // 想定外の値は Zod（campaignFiltersSchema）が弾く
      type: (state.filters.type || undefined) as
        | "generation"
        | "nurturing"
        | "qualification"
        | undefined,
      status: (state.filters.status || undefined) as
        | "draft"
        | "active"
        | "paused"
        | "completed"
        | "cancelled"
        | undefined,
      keyword: state.filters.search || undefined,
      perPage: DEFAULT_PAGE_SIZE,
      page: state.page,
      sortField: state.sort?.field,
      sortDirection: state.sort?.direction,
    }),
    getCurrentUser(),
  ]);

  return (
    <CampaignsView
      initialData={campaignsResult.data}
      currentUserRole={currentUserResult.data?.role ?? "member"}
    />
  );
}

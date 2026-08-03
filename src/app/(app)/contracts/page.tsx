import { getContracts } from "@/actions/contracts";
import { getCurrentUser } from "@/actions/users";
import { getContractTypes } from "@/actions/masters";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { ContractsView } from "./contracts-view";

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.contracts);

  const [{ data }, meResult, contractTypesResult] = await Promise.all([
    getContracts({
      search: state.filters.search || undefined,
      contractTypeId: state.filters.typeId || undefined,
      contractMethod: state.filters.methodId || undefined,
      perPage: DEFAULT_PAGE_SIZE,
      page: state.page,
      sortField: state.sort?.field,
      sortDirection: state.sort?.direction,
    }),
    getCurrentUser(),
    getContractTypes(),
  ]);
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";
  return (
    <ContractsView
      initialData={data}
      isManagerOrAbove={isManagerOrAbove}
      contractTypes={contractTypesResult.data ?? []}
    />
  );
}

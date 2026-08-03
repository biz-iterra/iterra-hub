import { getPotentialTypes, getTalents } from "@/actions/talents";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseListState } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { TalentsView } from "./talents-view";

export default async function TalentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 条件は URL に載っている。詳細から戻ったときも同じ条件で描く
  const params = await searchParams;
  const state = parseListState(
    new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) =>
        typeof v === "string" ? [[k, v] as [string, string]] : []
      )
    ),
    LIST_FILTER_KEYS.talents
  );

  const [talents, potentialTypes] = await Promise.all([
    getTalents({
      search: state.filters.search || undefined,
      potentialType: state.filters.potentialType || undefined,
      perPage: DEFAULT_PAGE_SIZE,
      page: state.page,
      sortField: state.sort?.field,
      sortDirection: state.sort?.direction,
    }),
    getPotentialTypes(),
  ]);

  return (
    <TalentsView
      initialData={talents.data}
      potentialTypes={potentialTypes.data ?? []}
    />
  );
}

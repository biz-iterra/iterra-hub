import { getCompanies } from "@/actions/companies";
import { getCompanyStatuses, getCorporateTypes } from "@/actions/masters";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { CompaniesView } from "./companies-view";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 条件は URL に載っている。詳細から戻ってきたときも同じ一覧を描く
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.companies);

  const [companiesResult, statusesResult, corporateTypesResult, usersResult, meResult] =
    await Promise.all([
      getCompanies({
        statusId: state.filters.statusId || undefined,
        corporateTypeId: state.filters.corporateTypeId || undefined,
        ownerUserId: state.filters.ownerUserId || undefined,
        search: state.filters.search || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: state.page,
        sortField: state.sort?.field,
        sortDirection: state.sort?.direction,
      }),
      getCompanyStatuses(),
      getCorporateTypes(),
      getCrmUsers(),
      getCurrentUser(),
    ]);

  return (
    <CompaniesView
      initialData={companiesResult.data}
      statuses={statusesResult.data ?? []}
      corporateTypes={corporateTypesResult.data ?? []}
      users={usersResult.data ?? []}
      // freee_partners は admin しか読めない（RLS）。他ロールでは連携済みでも
      // 空で返るため、admin のときだけ連携アイコンを出す
      isAdmin={meResult.data?.role === "admin"}
    />
  );
}

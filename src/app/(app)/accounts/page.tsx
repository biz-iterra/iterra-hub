import { getAccounts } from "@/actions/accounts";
import { getAccountStatuses, getAccountTypes } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { parseSearchParams } from "@/lib/list-params";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const state = parseSearchParams(await searchParams, LIST_FILTER_KEYS.accounts);

  const [accountsResult, statusesResult, accountTypesResult, usersResult] =
    await Promise.all([
      getAccounts({
        statusId: state.filters.statusId || undefined,
        accountTypeId: state.filters.typeId || undefined,
        ownerUserId: state.filters.ownerUserId || undefined,
        search: state.filters.search || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: state.page,
        sortField: state.sort?.field,
        sortDirection: state.sort?.direction,
      }),
      getAccountStatuses(),
      getAccountTypes(),
      getCrmUsers(),
    ]);

  return (
    <AccountsView
      initialData={accountsResult.data}
      statuses={statusesResult.data ?? []}
      accountTypes={accountTypesResult.data ?? []}
      users={usersResult.data ?? []}
    />
  );
}

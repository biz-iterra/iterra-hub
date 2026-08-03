import { getAccounts } from "@/actions/accounts";
import { getAccountStatuses, getAccountTypes } from "@/actions/masters";
import { getCrmUsers } from "@/actions/users";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage() {
  const [accountsResult, statusesResult, accountTypesResult, usersResult] =
    await Promise.all([
      getAccounts({ perPage: DEFAULT_PAGE_SIZE, page: 1 }),
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

import { getAccounts } from "@/actions/accounts";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage() {
  const { data } = await getAccounts();
  return <AccountsView initialData={data} />;
}

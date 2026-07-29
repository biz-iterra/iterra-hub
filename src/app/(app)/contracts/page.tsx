import { getContracts } from "@/actions/contracts";
import { getCurrentUser } from "@/actions/users";
import { getContractTypes } from "@/actions/masters";
import { ContractsView } from "./contracts-view";

export default async function ContractsPage() {
  const [{ data }, meResult, contractTypesResult] = await Promise.all([
    getContracts(),
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

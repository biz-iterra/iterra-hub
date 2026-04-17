import { getContracts } from "@/actions/contracts";
import { getCurrentUser } from "@/actions/users";
import { ContractsView } from "./contracts-view";

export default async function ContractsPage() {
  const [{ data }, meResult] = await Promise.all([
    getContracts(),
    getCurrentUser(),
  ]);
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";
  return <ContractsView initialData={data} isManagerOrAbove={isManagerOrAbove} />;
}

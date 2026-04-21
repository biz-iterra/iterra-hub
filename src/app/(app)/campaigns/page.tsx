import { getCampaigns } from "@/actions/campaigns";
import { getCurrentUser } from "@/actions/users";
import { CampaignsView } from "./campaigns-view";

export default async function CampaignsPage() {
  const [campaignsResult, currentUserResult] = await Promise.all([
    getCampaigns({ perPage: 50, page: 1 }),
    getCurrentUser(),
  ]);

  return (
    <CampaignsView
      initialData={campaignsResult.data}
      currentUserRole={currentUserResult.data?.role ?? "member"}
    />
  );
}

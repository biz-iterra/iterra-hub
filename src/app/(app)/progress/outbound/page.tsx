import { LeadProgressWorkspace } from "@/components/leads/LeadProgressWorkspace";
import { getCategoryIdByCode } from "../_category";

export default async function Page() {
  const categoryId = await getCategoryIdByCode("tql");

  return (
    <LeadProgressWorkspace
      categoryCode="tql"
      categoryId={categoryId}
      title="アウトバウンド進捗"
      description="架電や DM でこちらから当たったリード。"
    />
  );
}

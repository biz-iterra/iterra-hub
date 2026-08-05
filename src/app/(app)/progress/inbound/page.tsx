import { LeadProgressWorkspace } from "@/components/leads/LeadProgressWorkspace";
import { getCategoryIdByCode } from "../_category";

export default async function Page() {
  const categoryId = await getCategoryIdByCode("mql");

  return (
    <LeadProgressWorkspace
      categoryId={categoryId}
      title="インバウンド進捗"
      description="紹介・セミナー・名刺交換など、相手が接点を持つ意思を示したリード。"
    />
  );
}

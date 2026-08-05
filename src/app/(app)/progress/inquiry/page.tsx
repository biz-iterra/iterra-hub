import { LeadProgressWorkspace } from "@/components/leads/LeadProgressWorkspace";
import { getCategoryIdByCode } from "../_category";

export default async function Page() {
  const categoryId = await getCategoryIdByCode("inquiry");

  return (
    <LeadProgressWorkspace
      categoryId={categoryId}
      title="問い合わせ進捗"
      description="サイトの問い合わせフォームから来たリード。応対の進み具合を見る。"
    />
  );
}

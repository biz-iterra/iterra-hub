import { getBusinessCards } from "@/actions/business-cards";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { BusinessCardsView } from "./cards-view";

/**
 * 名刺の一覧。
 *
 * 名刺は連絡先詳細でしか見えず、紹介者の確認・修正に連絡先を 1 件ずつ
 * 開く必要があった。横断で見るための画面。
 */
export default async function BusinessCardsPage() {
  const { data } = await getBusinessCards({
    perPage: DEFAULT_PAGE_SIZE,
    page: 1,
  });

  return <BusinessCardsView initialData={data} />;
}

import { getTalents } from "@/actions/talents";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { TalentsView } from "./talents-view";

export default async function TalentsPage() {
  const { data } = await getTalents({ perPage: DEFAULT_PAGE_SIZE, page: 1 });
  return <TalentsView initialData={data} />;
}

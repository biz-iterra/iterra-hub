import { getTalents } from "@/actions/talents";
import { TalentsView } from "./talents-view";

export default async function TalentsPage() {
  const { data } = await getTalents({ perPage: 50, page: 1 });
  return <TalentsView initialData={data} />;
}

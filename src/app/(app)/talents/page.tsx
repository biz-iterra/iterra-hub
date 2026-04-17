import { getTalents } from "@/actions/talents";
import { TalentsView } from "./talents-view";

export default async function TalentsPage() {
  const { data } = await getTalents();
  return <TalentsView initialData={data} />;
}

import { getCompanies } from "@/actions/companies";
import { CompaniesView } from "./companies-view";

export default async function CompaniesPage() {
  const { data } = await getCompanies();
  return <CompaniesView initialData={data} />;
}

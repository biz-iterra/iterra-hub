import { getCurrentUser } from "@/actions/users";
import { redirect } from "next/navigation";
import { CampaignNewForm } from "./campaign-new-form";

export default async function CampaignNewPage() {
  const { data: currentUser } = await getCurrentUser();

  if (!currentUser) {
    redirect("/login");
  }

  // manager 以上のみアクセス可
  if (currentUser.role !== "manager" && currentUser.role !== "admin") {
    redirect("/campaigns");
  }

  return <CampaignNewForm />;
}

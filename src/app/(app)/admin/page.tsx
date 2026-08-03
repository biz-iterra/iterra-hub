import { redirect } from "next/navigation";

import { getCurrentUser } from "@/actions/users";
import { AdminView } from "./admin-view";

/**
 * マスタ管理。admin 限定（Server Action 側でも検証している）。
 */
export default async function AdminPage() {
  const me = await getCurrentUser();
  if (me.data?.role !== "admin") {
    redirect("/dashboard");
  }

  return <AdminView />;
}

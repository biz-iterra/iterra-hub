import { redirect } from "next/navigation";

import { getMembers } from "@/actions/members";
import { getCurrentUser } from "@/actions/users";
import { MembersView } from "./members-view";

/**
 * 社内メンバーの管理。
 * マスタ管理と同じく admin 限定（Server Action 側でも検証している）。
 */
export default async function MembersPage() {
  const me = await getCurrentUser();
  if (me.data?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data, error } = await getMembers();

  if (error) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>
      </div>
    );
  }

  return <MembersView members={data ?? []} />;
}

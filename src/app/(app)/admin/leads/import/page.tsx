import { redirect } from "next/navigation";
import { getCurrentUser, getCrmUsers } from "@/actions/users";
import { getImportBatches } from "@/actions/leads/eight-import";
import { EightImportView } from "./eight-import-view";

/**
 * Eight 名刺 CSV の取込画面。
 * マスタ管理と同じく admin 限定（middleware に加えて Server Action 側でも検証している）。
 */
export default async function EightImportPage() {
  const [meResult, usersResult, batchesResult] = await Promise.all([
    getCurrentUser(),
    getCrmUsers(),
    getImportBatches(),
  ]);

  if (meResult.data?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1280px", margin: "0 auto" }}>
      <EightImportView
        currentUserId={meResult.data.id}
        users={usersResult.data ?? []}
        batches={batchesResult.data ?? []}
      />
    </div>
  );
}

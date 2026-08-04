import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/users";
import { getFreeePartnerDiffs } from "@/actions/freee";
import { FreeeSyncView } from "./freee-sync-view";

/**
 * freee と CRM の差分を見て、項目ごとにどちらを採るか決める画面。
 *
 * **CRM が正**という前提だが、自動では書かない（docs/database-design.md §26）。
 * 会計データを触るので、人が確認して確定したものだけを送る。
 */
export default async function FreeeSyncPage() {
  const [meResult, diffsResult] = await Promise.all([
    getCurrentUser(),
    getFreeePartnerDiffs(),
  ]);

  if (meResult.data?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <FreeeSyncView diffs={diffsResult.data ?? []} loadError={diffsResult.error} />
  );
}

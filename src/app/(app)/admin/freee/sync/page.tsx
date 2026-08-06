import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/users";
import { getFreeePartnerDiffs } from "@/actions/freee";
import {
  getIntegrationProfileHints,
  listIgnoredIntegrationFields,
} from "@/actions/integration-profiles";
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

  const diffs = diffsResult.data ?? [];
  // 差分画面から連携プロファイルを直せるようにするための補助情報。
  // **対象外にした項目は差分に出てこない**ので、一覧は別で引く（戻す入口が要る）
  const [hintsResult, ignoredResult] = await Promise.all([
    getIntegrationProfileHints(
      diffs.map((d) => d.companyId),
      "freee"
    ),
    listIgnoredIntegrationFields("freee"),
  ]);

  return (
    <FreeeSyncView
      diffs={diffs}
      loadError={diffsResult.error}
      hints={hintsResult.data ?? {}}
      ignoredList={ignoredResult.data ?? []}
    />
  );
}

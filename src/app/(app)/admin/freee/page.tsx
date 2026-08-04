import { redirect } from "next/navigation";
import { getCurrentUser } from "@/actions/users";
import { getFreeeConnection } from "@/actions/freee";
import { FreeeSettingsView } from "./freee-settings-view";
import { detailContainerClass } from "@/lib/layout";

/**
 * freee 会計連携の設定画面。
 * 会計データに繋がるため admin 限定（middleware に加えてここでも検証する）。
 */
export default async function FreeeSettingsPage() {
  const [meResult, connectionResult] = await Promise.all([
    getCurrentUser(),
    getFreeeConnection(),
  ]);

  if (meResult.data?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className={detailContainerClass}>
      <FreeeSettingsView
        status={connectionResult.data ?? { configured: false, connection: null }}
        loadError={connectionResult.error}
      />
    </div>
  );
}

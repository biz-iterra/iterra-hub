/**
 * アクティビティ表示の共通ルール。
 *
 * 一覧（/activities）とダッシュボードの両方から使う。
 * 片方だけ直すと同じ記録が画面ごとに別の見え方になるため、ここに集約する。
 */

import type { ActivityFeedSourceKind } from "@/types/relations";

/** 記録元の表示名。activity_feed ビューの source_kind と 1:1 */
export const ACTIVITY_SOURCE_LABELS: Record<ActivityFeedSourceKind, string> = {
  lead_activity: "社内対応",
  lead_customer_activity: "顧客行動",
  email: "メール",
};

/**
 * 時刻を持たない記録（架電日だけを入力したものなど）は 0:00 を出さず
 * 日付で止める。0 時の出来事だと誤読させないため。
 */
export function formatOccurredAt(value: string, hasTime: boolean | null): string {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const date = `${yyyy}/${mm}/${dd}`;
  if (hasTime === false) return date;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${date} ${hh}:${mi}`;
}

/** 相手先の詳細ページ */
export function activityEntityHref(
  entityType: string | null,
  entityId: string | null
): string {
  return entityType === "lead" ? `/leads/${entityId}` : `/contacts/${entityId}`;
}

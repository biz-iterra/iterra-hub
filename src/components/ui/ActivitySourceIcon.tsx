import { ACTIVITY_SOURCE_ICONS, ACTIVITY_SOURCE_LABELS } from "@/lib/activity";
import type { ActivityFeedSourceKind } from "@/types/relations";

/**
 * アクティビティの記録元（社内対応 / 顧客行動 / メール）を表すアイコン。
 *
 * 日時の横に置いて、種別バッジを読まなくても何の記録か分かるようにする。
 * 一覧では日時が左端に来るので、行を目で追ったときに最初に種別が入る。
 *
 * 色はアイコン単体では持たせない（種別ごとの色はバッジが担う）。ここで
 * 別の色を振ると、同じ記録に色が 2 つ付いて意味が読み取りにくくなる。
 */
export function ActivitySourceIcon({
  sourceKind,
  size = 13,
}: {
  /**
   * activity_feed ビューの source_kind。ビューの列は NULL 許容で型が付くため
   * string | null も受ける。既知の値でなければ何も描かない（記録元不明の行に
   * 意味のないアイコンを出さない）
   */
  sourceKind: ActivityFeedSourceKind | string | null;
  size?: number;
}) {
  if (!sourceKind || !(sourceKind in ACTIVITY_SOURCE_ICONS)) return null;

  const kind = sourceKind as ActivityFeedSourceKind;
  const Icon = ACTIVITY_SOURCE_ICONS[kind];
  const label = ACTIVITY_SOURCE_LABELS[kind];

  // アイコンだけでは種別が伝わらない利用者のために、読み上げ用の文字を添える。
  // 見た目上は title 属性のツールチップで補う
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        flexShrink: 0,
        color: "var(--color-sumi500)",
      }}
    >
      <Icon size={size} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

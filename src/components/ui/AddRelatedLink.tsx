import Link from "next/link";
import { Plus } from "lucide-react";
import type { CSSProperties } from "react";

/**
 * 詳細ページのセクション見出しに置く「関連するものを追加」リンク。
 *
 * 詳細ページ自体は閲覧専用という原則（feedback_edit_flow_unified）は崩さない。
 * ここで行うのは**別のエンティティの作成ページへ移動すること**だけで、
 * この画面で値を書き換えるわけではない。移動先には親の ID を渡し、
 * 相手が初期選択された状態から始められるようにする。
 *
 * 相手先の付け替えができなくならないよう、**移動先では固定にしない**
 * （初期選択に留める）。
 */
const linkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  color: "var(--color-terra)",
  textDecoration: "none",
  fontSize: "0.75rem",
  fontWeight: 500,
  padding: "0.25rem 0.5rem",
  borderRadius: "var(--radius-sm)",
  whiteSpace: "nowrap",
};

export function AddRelatedLink({
  href,
  label,
}: {
  href: string;
  /** 「連絡先を追加」など、何が増えるのかが分かる語にする */
  label: string;
}) {
  return (
    <Link href={href} style={linkStyle} className="hover:bg-[var(--color-bg-hover)]">
      <Plus size={13} />
      {label}
    </Link>
  );
}

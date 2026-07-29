import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export interface EntityLinkProps {
  href: string;
  children: ReactNode;
  /** 小さめ表示（テーブルセル等） */
  compact?: boolean;
  /** アイコンサイズを明示したい場合 */
  iconSize?: number;
}

const baseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  color: "var(--color-terra)",
  textDecoration: "none",
  padding: "0.125rem 0.375rem",
  margin: "-0.125rem -0.375rem",
  borderRadius: "var(--radius-sm)",
  transition: "background-color 0.15s",
  fontSize: "0.875rem",
  fontWeight: 500,
};

const compactStyle: CSSProperties = {
  ...baseStyle,
  fontSize: "0.8125rem",
};

/**
 * 別ページへ遷移するリンクの統一コンポーネント。
 * 末尾に ArrowUpRight アイコンを付与し、ホバーで薄い背景色を表示する。
 */
export function EntityLink({
  href,
  children,
  compact = false,
  iconSize,
}: EntityLinkProps) {
  const size = iconSize ?? (compact ? 12 : 14);
  return (
    <Link
      href={href}
      className="hover:bg-[var(--color-bg-hover)]"
      style={compact ? compactStyle : baseStyle}
    >
      {children}
      <ArrowUpRight size={size} />
    </Link>
  );
}

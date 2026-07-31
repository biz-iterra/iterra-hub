import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface DetailSectionProps {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  /** カードスタイルを上書きしたい場合 */
  cardStyle?: CSSProperties;
  /**
   * 見出し行の右端に置く要素（件数・合計・出所ラベルなど）。
   * 見出しの一部として扱いたい補足をカード内に押し込まずに済ませる。
   */
  action?: ReactNode;
}

const headingRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  margin: "0 0.25rem 0.5rem",
};

const headingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  margin: 0,
  color: "var(--color-text-title)",
  fontSize: "0.875rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
};

const defaultCardStyle: CSSProperties = {
  backgroundColor: "var(--color-bg-surface)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--elevation-low)",
  padding: "1.25rem 1.5rem",
};

export function DetailSection({
  title,
  icon: Icon,
  children,
  cardStyle,
  action,
}: DetailSectionProps) {
  return (
    <section>
      <div style={headingRowStyle}>
        <h2 style={headingStyle}>
          {Icon && <Icon size={14} style={{ color: "var(--color-sumi600)" }} />}
          {title}
        </h2>
        {action}
      </div>
      <div style={{ ...defaultCardStyle, ...cardStyle }}>{children}</div>
    </section>
  );
}

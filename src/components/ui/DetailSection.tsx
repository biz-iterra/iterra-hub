import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface DetailSectionProps {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  /** カードスタイルを上書きしたい場合 */
  cardStyle?: CSSProperties;
}

const headingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  margin: "0 0 0.5rem 0.25rem",
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
}: DetailSectionProps) {
  return (
    <section>
      <h2 style={headingStyle}>
        {Icon && <Icon size={14} style={{ color: "var(--color-sumi600)" }} />}
        {title}
      </h2>
      <div style={{ ...defaultCardStyle, ...cardStyle }}>{children}</div>
    </section>
  );
}

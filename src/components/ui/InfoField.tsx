import type { CSSProperties, ReactNode } from "react";

export interface InfoFieldProps {
  label: string;
  value?: ReactNode;
  /** 値がない場合のプレースホルダ */
  empty?: string;
  /** full-width（grid 2列の全体を使う） */
  full?: boolean;
}

const labelStyle: CSSProperties = {
  display: "block",
  color: "var(--color-sumi600)",
  fontSize: "0.75rem",
  fontWeight: 600,
  marginBottom: "0.25rem",
};

const valueStyle: CSSProperties = {
  color: "var(--color-text-body)",
  fontSize: "0.875rem",
  margin: 0,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word",
};

const emptyStyle: CSSProperties = {
  ...valueStyle,
  color: "var(--color-sumi400)",
};

const EM_DASH = "—";

function isEmpty(value: ReactNode): boolean {
  return value === null || value === undefined || value === "" || value === EM_DASH;
}

export function InfoField({
  label,
  value,
  empty = EM_DASH,
  full = false,
}: InfoFieldProps) {
  const empty_ = isEmpty(value);
  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <span style={labelStyle}>{label}</span>
      {empty_ ? (
        <p style={emptyStyle}>{empty}</p>
      ) : typeof value === "string" || typeof value === "number" ? (
        <p style={valueStyle}>{value}</p>
      ) : (
        <div style={valueStyle}>{value}</div>
      )}
    </div>
  );
}

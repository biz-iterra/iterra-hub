"use client";

import { type CSSProperties } from "react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterSelectOption[];
  /** 空値（全件）オプションのラベル。省略すると「-- 未選択 --」 */
  placeholder?: string;
  className?: string;
}

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.625rem",
  fontWeight: 600,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--color-sumi700)",
  marginBottom: "0.2rem",
  whiteSpace: "nowrap",
};

const selectStyle: CSSProperties = {
  display: "block",
  width: "100%",
  border: "1px solid var(--color-border-default)",
  borderRadius: "var(--radius-button)",
  backgroundColor: "#fff",
  color: "var(--color-text-title)",
  fontSize: "0.8125rem",
  padding: "0.4rem 0.75rem",
  outline: "none",
  cursor: "pointer",
  appearance: "auto",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "-- 未選択 --",
  className,
}: FilterSelectProps) {
  return (
    <div className={className} style={{ display: "flex", flexDirection: "column" }}>
      <label style={labelStyle}>{label}</label>
      <select
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
        style={selectStyle}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

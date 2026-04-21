"use client";

import { useRef, type CSSProperties } from "react";
import { Search, X } from "lucide-react";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "検索...",
  className,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const wrapStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    flex: "1 1 12rem",
    minWidth: "12rem",
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    paddingLeft: "2.125rem",
    paddingRight: value ? "2rem" : "0.75rem",
    paddingTop: "0.4rem",
    paddingBottom: "0.4rem",
    fontSize: "0.8125rem",
    color: "var(--color-text-title)",
    backgroundColor: "#fff",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  const iconStyle: CSSProperties = {
    position: "absolute",
    left: "0.625rem",
    color: "var(--color-sumi400)",
    pointerEvents: "none",
    flexShrink: 0,
  };

  const clearStyle: CSSProperties = {
    position: "absolute",
    right: "0.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "none",
    border: "none",
    padding: "0.125rem",
    cursor: "pointer",
    color: "var(--color-sumi400)",
    borderRadius: "var(--radius-full)",
    lineHeight: 1,
  };

  return (
    <div style={wrapStyle} className={className}>
      <Search size={15} style={iconStyle} aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
        style={inputStyle}
      />
      {value && (
        <button
          type="button"
          aria-label="検索をクリア"
          style={clearStyle}
          tabIndex={-1}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--color-text-body)";
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--color-sumi400)";
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

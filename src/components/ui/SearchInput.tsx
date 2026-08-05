"use client";

import { useRef, type CSSProperties } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchField } from "@/hooks/useSearchField";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 一覧の検索欄。
 *
 * 待ち時間と**日本語入力（IME）の扱いは `useSearchField` が持つ**。
 * ここに自前で onChange を書かないこと（変換中に検索が走り、入力が壊れる）。
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "検索...",
  className,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { draft, commit, inputProps } = useSearchField({ value, onChange });

  /*
   * 伸縮は style ではなくクラスで持つ。
   * flex-basis を style で固定すると、フィルタ行が縦積みになる狭幅で
   * 「基準 12rem」が高さの指定として効き、入力欄が 192px に伸びてしまう。
   */
  const wrapStyle: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    paddingLeft: "2.125rem",
    paddingRight: draft ? "2rem" : "0.75rem",
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
    <div
      style={wrapStyle}
      className={cn("w-full sm:flex-[1_1_12rem] sm:min-w-[12rem]", className)}
    >
      <Search size={15} style={iconStyle} aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        aria-label={placeholder}
        {...inputProps}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
        style={inputStyle}
      />
      {draft && (
        <button
          type="button"
          aria-label="検索をクリア"
          style={clearStyle}
          tabIndex={-1}
          onClick={() => {
            // クリアは待たせない。押した結果がすぐ見えないと押し直される
            commit("", true);
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

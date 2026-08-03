"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * 入力が止まってから親へ伝えるまでの時間。
 *
 * 一覧の条件は URL に載せてサーバーから取り直すため、1 文字ごとに伝えると
 * 打っている途中で再描画が挟まり、入力が取りこぼされる。
 * 打鍵の間隔より長く、待たされたと感じない程度に置く。
 */
const DEBOUNCE_MS = 300;

export function SearchInput({
  value,
  onChange,
  placeholder = "検索...",
  className,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 表示は手元の値、確定は遅らせる。打っている最中に外から値を戻されないよう、
  // 「最後に親へ渡した値」を覚えておいて、それと違うときだけ外の値に従う
  // （リセット・ブラウザの戻るで条件が変わった場合がこれに当たる）
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = (next: string, immediate = false) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    const fire = () => {
      committed.current = next;
      onChange(next);
    };
    if (immediate) fire();
    else timer.current = setTimeout(fire, DEBOUNCE_MS);
  };

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
        value={draft}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => commit(e.target.value)}
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

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { globalSearch, type SearchResult, type SearchResultType } from "@/actions/search";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

// 表示順（globalSearch の push 順と一致させ、キーボード選択のインデックスをそのまま流用する）
const GROUP_ORDER: SearchResultType[] = [
  "lead",
  "deal",
  "account",
  "company",
  "contact",
  "contract",
  "project",
  "campaign",
];

const styles = {
  wrapper: {
    position: "relative",
    width: "100%",
    maxWidth: "28rem",
  } as CSSProperties,
  inputWrap: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  } as CSSProperties,
  icon: {
    position: "absolute",
    left: "0.625rem",
    color: "var(--color-sumi400)",
    pointerEvents: "none",
    flexShrink: 0,
  } as CSSProperties,
  input: {
    width: "100%",
    paddingLeft: "2.125rem",
    paddingRight: "2.125rem",
    paddingTop: "0.4rem",
    paddingBottom: "0.4rem",
    fontSize: "0.8125rem",
    color: "var(--color-text-title)",
    backgroundColor: "var(--color-bg-alt)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s, background-color 0.15s",
  } as CSSProperties,
  kbdHint: {
    position: "absolute",
    right: "0.5rem",
    fontSize: "0.6875rem",
    color: "var(--color-sumi400)",
    pointerEvents: "none",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-sm)",
    padding: "0.0625rem 0.3125rem",
    backgroundColor: "#fff",
  } as CSSProperties,
  dropdown: {
    position: "absolute",
    top: "calc(100% + 0.375rem)",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-panel)",
    boxShadow: "var(--elevation-high)",
    maxHeight: "24rem",
    overflowY: "auto",
    zIndex: 50,
  } as CSSProperties,
  groupLabel: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--color-sumi500)",
    padding: "0.5rem 0.875rem 0.25rem",
  } as CSSProperties,
  item: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    textAlign: "left",
    padding: "0.5rem 0.875rem",
    border: "none",
    background: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  } as CSSProperties,
  itemTitle: {
    fontSize: "0.8125rem",
    color: "var(--color-text-title)",
  } as CSSProperties,
  itemSubtitle: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    marginTop: "0.0625rem",
  } as CSSProperties,
  empty: {
    padding: "1rem",
    fontSize: "0.8125rem",
    color: "var(--color-sumi500)",
    textAlign: "center",
  } as CSSProperties,
};

export function GlobalSearch() {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeqRef = useRef(0);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Ctrl/Cmd+K でフォーカス
  useEffect(() => {
    function handleGlobalKeydown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", handleGlobalKeydown);
    return () => window.removeEventListener("keydown", handleGlobalKeydown);
  }, []);

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // デバウンス付き検索実行
  useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const seq = ++requestSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      const data = await globalSearch(trimmed);
      if (seq === requestSeqRef.current) {
        setResults(data);
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  const handleSelect = (item: SearchResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      }
    }
  };

  const showDropdown = open && query.trim().length >= MIN_QUERY_LENGTH;
  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: results.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <div style={styles.inputWrap}>
        <Search size={15} style={styles.icon} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="検索 (Ctrl+K)"
          aria-label="横断検索"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={styles.input}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.style.borderColor = "var(--color-border-focus)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
            e.currentTarget.style.backgroundColor = "#fff";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border-default)";
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.backgroundColor = "var(--color-bg-alt)";
          }}
        />
        {loading ? (
          <Loader2
            size={14}
            className="animate-spin"
            style={{ position: "absolute", right: "0.625rem", color: "var(--color-sumi400)" }}
            aria-hidden="true"
          />
        ) : (
          !query && <span style={styles.kbdHint}>Ctrl+K</span>
        )}
      </div>

      {showDropdown && (
        <div style={styles.dropdown} role="listbox">
          {loading && results.length === 0 && <p style={styles.empty}>検索中...</p>}
          {!loading && grouped.length === 0 && <p style={styles.empty}>該当なし</p>}
          {grouped.map((group) => (
            <div key={group.type}>
              <p style={styles.groupLabel}>{group.items[0].typeLabel}</p>
              {group.items.map((item) => {
                const index = results.indexOf(item);
                const isActive = index === activeIndex;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    type="button"
                    style={{
                      ...styles.item,
                      backgroundColor: isActive ? "var(--color-bg-hover)" : "transparent",
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handleSelect(item)}
                    role="option"
                    aria-selected={isActive}
                  >
                    <span style={styles.itemTitle}>{item.title}</span>
                    {item.subtitle && <span style={styles.itemSubtitle}>{item.subtitle}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

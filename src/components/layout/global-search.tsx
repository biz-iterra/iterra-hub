"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { globalSearch, type SearchResult, type SearchResultType } from "@/actions/search";
import { useSearchField } from "@/hooks/useSearchField";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

// 文字数が足りないときに返す空配列。参照を固定して不要な再計算・再描画を避ける
const EMPTY_RESULTS: SearchResult[] = [];

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
  /*
   * 表示は draft、検索に使うのは query。
   * **日本語入力の変換中は query を更新しない**（未確定の文字で検索すると、
   * 結果の再描画で変換が中断される）。検索そのものの待ち時間は下の
   * エフェクトが持つので、ここは確定したら即座に渡す（debounceMs: 0）。
   */
  const {
    draft,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
    isComposingKey,
  } = useSearchField({ value: query, onChange: setQuery, debounceMs: 0 });
  const [results, setResults] = useState<SearchResult[]>([]);
  // results がどの検索語の結果かを保持する。読み込み中かどうかはこれと現在の検索語の
  // 差から導出する（loading を state に持つとエフェクト内 setState が必要になるため）
  const [resultsFor, setResultsFor] = useState("");
  const [open, setOpen] = useState(false);
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

  const trimmedQuery = query.trim();
  const isSearchable = trimmedQuery.length >= MIN_QUERY_LENGTH;

  // デバウンス付き検索実行。
  // 文字数が足りない間は state を消さずに何もしない（表示側で導出する）。
  // エフェクト内で同期的に setState するとカスケードレンダーになるため。
  useEffect(() => {
    if (!isSearchable) {
      // 実行中のリクエストの結果を捨てる（seq をずらすだけ。state は触らない）
      requestSeqRef.current++;
      return;
    }

    const seq = ++requestSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      const data = await globalSearch(trimmedQuery);
      if (seq === requestSeqRef.current) {
        setResults(data);
        setResultsFor(trimmedQuery);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmedQuery, isSearchable]);

  // 文字数が足りない間は保持している結果を見せない（state を消す代わりに導出する）
  const visibleResults = isSearchable ? results : EMPTY_RESULTS;
  // 現在の検索語に対する結果がまだ無ければ読み込み中
  const showLoading = isSearchable && resultsFor !== trimmedQuery;

  // 表示結果が変わったら選択位置を戻す。
  // エフェクトではなくレンダー中に調整する（React 推奨。再描画が 1 回で済む）
  const [prevResults, setPrevResults] = useState(visibleResults);
  if (prevResults !== visibleResults) {
    setPrevResults(visibleResults);
    setActiveIndex(-1);
  }

  const handleSelect = (item: SearchResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setResultsFor("");
    router.push(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // **変換を確定させた Enter で候補を選ばせない**（変換中の矢印キーも同じ）
    if (isComposingKey(e)) return;
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || visibleResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visibleResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && visibleResults[activeIndex]) {
        e.preventDefault();
        handleSelect(visibleResults[activeIndex]);
      }
    }
  };

  const showDropdown = open && isSearchable;
  const grouped = GROUP_ORDER.map((type) => ({
    type,
    items: visibleResults.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  const listboxId = "global-search-listbox";
  const getOptionId = (item: SearchResult) => `global-search-option-${item.type}-${item.id}`;
  const activeItem = activeIndex >= 0 ? visibleResults[activeIndex] : undefined;
  const resultCountMessage =
    showDropdown && !showLoading
      ? grouped.length === 0
        ? "該当なし"
        : `${visibleResults.length} 件の候補`
      : "";

  return (
    <div ref={wrapperRef} style={styles.wrapper}>
      <div style={styles.inputWrap}>
        <Search size={15} style={styles.icon} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          placeholder="検索 (Ctrl+K)"
          aria-label="横断検索"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-activedescendant={showDropdown && activeItem ? getOptionId(activeItem) : undefined}
          onChange={handleChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
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
        {showLoading ? (
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

      {/* 検索結果件数の変化をスクリーンリーダーへ通知（視覚的には非表示） */}
      <span className="sr-only" role="status" aria-live="polite">
        {resultCountMessage}
      </span>

      {showDropdown && (
        <div id={listboxId} style={styles.dropdown} role="listbox" aria-label="検索結果">
          {showLoading && visibleResults.length === 0 && <p style={styles.empty}>検索中...</p>}
          {!showLoading && grouped.length === 0 && <p style={styles.empty}>該当なし</p>}
          {grouped.map((group) => (
            <div key={group.type} role="group" aria-label={group.items[0].typeLabel}>
              <p style={styles.groupLabel} role="presentation">
                {group.items[0].typeLabel}
              </p>
              {group.items.map((item) => {
                const index = visibleResults.indexOf(item);
                const isActive = index === activeIndex;
                return (
                  <button
                    key={`${item.type}-${item.id}`}
                    id={getOptionId(item)}
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

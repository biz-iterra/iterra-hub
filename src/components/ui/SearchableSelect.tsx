"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { searchLookupOptions, type LookupKind } from "@/actions/lookup";

/**
 * 打ちながら絞り込める選択欄。
 *
 * ネイティブの `<select>` にも先頭一致で飛ぶ機能はあるが、**打っている文字が
 * どこにも出ない。** 事業者情報のように候補が千件あると、今どこまで打ったのか
 * 分からないまま候補だけが動くことになる。入力欄を出して、打った文字と
 * 絞り込みの結果を見えるようにする。
 *
 * 表示件数には上限がある。全件を DOM に並べると開くたびに固まるため、
 * 溢れた分は件数だけ知らせて絞り込みを促す。
 */

export type SearchableSelectOption = { value: string; label: string };

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchableSelectOption[];
  /** 未設定に戻せるか */
  nullable?: boolean;
  emptyOptionLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
  /**
   * サーバーへ打った文字を投げて候補を引く。
   *
   * 事業者情報のように候補が数千件あるものは先に配りきれない。これを渡すと
   * `options` は最初に見せる分だけになり、絞り込みはサーバーが行う。
   */
  searchKind?: LookupKind;
}

/** 一度に並べる上限。これを超えた分は件数だけ出す */
const MAX_VISIBLE = 100;

const styles = {
  wrap: { position: "relative", flex: 1, minWidth: 0 } as CSSProperties,
  input: {
    width: "100%",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.5rem",
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
    color: "var(--color-text-body)",
  } as CSSProperties,
  list: {
    position: "absolute",
    zIndex: 30,
    top: "calc(100% + 0.25rem)",
    left: 0,
    right: 0,
    maxHeight: "16rem",
    overflowY: "auto",
    margin: 0,
    padding: "0.25rem",
    listStyle: "none",
    backgroundColor: "#fff",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-medium, 0 4px 16px rgba(0,0,0,0.12))",
  } as CSSProperties,
  option: {
    padding: "0.375rem 0.5rem",
    fontSize: "0.875rem",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  } as CSSProperties,
  note: {
    padding: "0.375rem 0.5rem",
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
};

export function SearchableSelect({
  value,
  onChange,
  options,
  nullable = true,
  emptyOptionLabel = "未設定",
  placeholder = "入力して絞り込み",
  disabled = false,
  autoFocus = false,
  ariaLabel,
  style,
  searchKind,
}: SearchableSelectProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [remote, setRemote] = useState<SearchableSelectOption[] | null>(null);
  const [searching, setSearching] = useState(false);
  // サーバー検索で選んだ相手は options に無いことがある。名前を覚えておかないと
  // 選んだ直後に欄が空になる
  const [picked, setPicked] = useState<SearchableSelectOption | null>(null);

  const selectedLabel = useMemo(() => {
    if (picked && picked.value === value) return picked.label;
    return options.find((o) => o.value === value)?.label ?? "";
  }, [options, value, picked]);

  /** 未設定に戻す選択肢を先頭に足す（戻せる場合だけ） */
  const candidates = useMemo(() => {
    const source = remote ?? options;
    const base: SearchableSelectOption[] = nullable
      ? [{ value: "", label: emptyOptionLabel }, ...source]
      : [...source];
    const q = query.trim().toLowerCase();
    // サーバーが絞った結果を手元で絞り直すと、表記ゆれで消えてしまう
    if (!q || remote) return base;
    return base.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, remote, nullable, emptyOptionLabel, query]);

  const visible = candidates.slice(0, MAX_VISIBLE);
  const overflow = candidates.length - visible.length;

  // 絞り込むたびに先頭へ戻す。前の位置に残ると Enter で意図しないものを選ぶ
  useEffect(() => setHighlight(0), [query, open]);

  // 打つたびにサーバーへ投げる。1 文字ごとに叩かないよう少し待つ
  useEffect(() => {
    if (!searchKind || !open) return;
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchLookupOptions(searchKind, query)
        .then((rows) => {
          if (alive) setRemote(rows);
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [searchKind, query, open]);

  // 外側を触ったら閉じる。選択せずに離れたときは打った文字を捨てる
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(option: SearchableSelectOption) {
    setPicked(option);
    onChange(option.value);
    setQuery("");
    setRemote(null);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => {
        if (visible.length === 0) return 0;
        return (h + delta + visible.length) % visible.length;
      });
      return;
    }
    if (e.key === "Enter") {
      if (!open) return;
      e.preventDefault();
      const picked = visible[highlight];
      if (picked) choose(picked);
      return;
    }
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={wrapRef} style={{ ...styles.wrap, ...style }}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        disabled={disabled}
        // 開いている間は打った文字、閉じている間は選んだものを見せる
        value={open ? query : selectedLabel}
        placeholder={selectedLabel || placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onFocusCapture={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-focus)";
          e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--color-border-default)";
          e.currentTarget.style.boxShadow = "none";
        }}
        style={styles.input}
      />

      {open && (
        <ul id={listId} role="listbox" style={styles.list}>
          {visible.length === 0 ? (
            <li style={styles.note}>
              {searching ? "検索中..." : "一致するものがありません"}
            </li>
          ) : (
            visible.map((o, i) => (
              <li
                key={o.value || "__empty__"}
                role="option"
                aria-selected={o.value === value}
                // blur より先に拾わないと、押した瞬間に閉じて選べない
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  ...styles.option,
                  backgroundColor:
                    i === highlight ? "var(--color-bg-hover)" : "transparent",
                  color: o.value
                    ? "var(--color-text-body)"
                    : "var(--color-sumi500)",
                  fontWeight: o.value === value ? 600 : 400,
                }}
                title={o.label}
              >
                {o.label}
              </li>
            ))
          )}
          {overflow > 0 && (
            <li style={styles.note}>ほか {overflow} 件。入力して絞り込んでください</li>
          )}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { EntityLink } from "@/components/ui/EntityLink";
import { useToast } from "@/components/ui/toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { LookupKind } from "@/actions/lookup";
import type { RelationOption } from "@/components/ui/RelationField";

/**
 * 相手を何件でもぶら下げられる紐づけ（中間テーブル）を、詳細ページの
 * セクションのまま足したり外したりする。
 *
 * [RelationField](./RelationField.tsx) が 1 件の付け替えを扱うのに対し、
 * こちらは行の増減。連絡先と取引先のように**どちらが親とも言えない**関係で使う。
 * 子の一覧（取引先から見たディールなど）はこれを使わない。親を選ぶのは子側の仕事で、
 * 逆から足せると同じ紐づけの入口が 2 つに増えるため。
 */

export type RelationListRow = {
  /** 外すときに使う相手の id（中間テーブルの id ではない） */
  id: string;
  href: string;
  label: string;
  /** コードなど、名前の上に小さく出すもの */
  code?: string | null;
  /** 役割など、名前の後ろに出すもの */
  badge?: string | null;
};

export interface RelationListSectionProps {
  /** エラーメッセージに出す名前。見出しは呼び出し側の DetailSection が持つ */
  label: string;
  rows: RelationListRow[];
  /** 足せる相手。既にぶら下がっているものは呼び出し側で除いておく */
  options: readonly RelationOption[];
  /** 相手のほかに決めることがある場合（取引先での役割など） */
  extra?: { label: string; options: readonly RelationOption[]; defaultValue?: string };
  onAdd: (value: string, extra?: string) => Promise<{ error: string | null }>;
  onRemove: (id: string) => Promise<{ error: string | null }>;
  editable?: boolean;
  /** 相手が 1 件も無いときの案内 */
  emptyOptionsMessage?: string;
  /** 候補が多くて配りきれないものは、打った文字でサーバーから引く */
  searchKind?: LookupKind;
};

const styles = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    borderBottom: "1px solid var(--color-border-default)",
    paddingBottom: "0.5rem",
  } as CSSProperties,
  code: {
    display: "block",
    color: "var(--color-sumi500)",
    fontSize: "0.6875rem",
    fontFamily: "monospace",
    letterSpacing: "0.02em",
  } as CSSProperties,
  badge: {
    marginLeft: "0.375rem",
    backgroundColor: "var(--color-sumi100)",
    borderRadius: "var(--radius-badge)",
    padding: "0.125rem 0.5rem",
    fontSize: "0.625rem",
    color: "var(--color-sumi600)",
  } as CSSProperties,
  empty: {
    color: "var(--color-sumi400)",
    fontSize: "0.875rem",
    margin: 0,
  } as CSSProperties,
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.25rem",
    height: "1.25rem",
    flexShrink: 0,
    border: "none",
    backgroundColor: "transparent",
    borderRadius: "var(--radius-sm)",
    color: "var(--color-sumi500)",
    cursor: "pointer",
    padding: 0,
  } as CSSProperties,
  addRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    marginTop: "0.75rem",
    flexWrap: "wrap" as const,
  } as CSSProperties,
  select: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.5rem",
    minWidth: 0,
    flex: 1,
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
  } as CSSProperties,
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    border: "1px solid var(--color-border-default)",
    backgroundColor: "transparent",
    borderRadius: "var(--radius-button)",
    padding: "0.25rem 0.625rem",
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    cursor: "pointer",
    marginTop: "0.75rem",
  } as CSSProperties,
  save: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.75rem",
    height: "1.75rem",
    border: "none",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  } as CSSProperties,
  cancel: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.75rem",
    height: "1.75rem",
    border: "1px solid var(--color-border-default)",
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    borderRadius: "var(--radius-button)",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  } as CSSProperties,
};

export function RelationListSection({
  label,
  rows,
  options,
  extra,
  onAdd,
  onRemove,
  editable = true,
  emptyOptionsMessage = "追加できる相手がありません",
  searchKind,
}: RelationListSectionProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftExtra, setDraftExtra] = useState(extra?.defaultValue ?? "");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ error: string | null }>) {
    setBusy(true);
    try {
      const result = await fn();
      if (result.error) {
        showToast({ type: "error", message: result.error });
        return false;
      }
      showToast({ type: "success", message: "保存しました" });
      router.refresh();
      return true;
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!draft) {
      showToast({ type: "error", message: `${label}を選んでください` });
      return;
    }
    const ok = await run(() => onAdd(draft, draftExtra || undefined));
    if (ok) {
      setAdding(false);
      setDraft("");
      setDraftExtra(extra?.defaultValue ?? "");
    }
  }

  return (
    <>
      {rows.length === 0 ? (
        <p style={styles.empty}>—</p>
      ) : (
        <div style={styles.list}>
          {rows.map((row) => (
            <div key={row.id} style={styles.row}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {row.code && <span style={styles.code}>{row.code}</span>}
                <EntityLink href={row.href} compact>
                  {row.label}
                </EntityLink>
                {row.badge && <span style={styles.badge}>{row.badge}</span>}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => run(() => onRemove(row.id))}
                  disabled={busy}
                  aria-label={`${row.label}との紐づけを外す`}
                  title="紐づけを外す"
                  className="hover:bg-[var(--color-bg-hover)]"
                  style={styles.iconButton}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable &&
        (adding ? (
          <div style={styles.addRow}>
            {options.length === 0 ? (
              <p style={styles.empty}>{emptyOptionsMessage}</p>
            ) : (
              <>
                <SearchableSelect
                  value={draft}
                  onChange={setDraft}
                  options={options}
                  // 足す相手を選ぶ欄なので「未設定」は要らない
                  nullable={false}
                  disabled={busy}
                  autoFocus
                  ariaLabel={label}
                  searchKind={searchKind}
                />
                {extra && (
                  <select
                    value={draftExtra}
                    onChange={(e) => setDraftExtra(e.target.value)}
                    disabled={busy}
                    aria-label={extra.label}
                    style={{ ...styles.select, flex: "0 0 auto" }}
                  >
                    {extra.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={add}
                  disabled={busy}
                  aria-label="追加"
                  title="追加"
                  style={styles.save}
                >
                  <Plus size={14} />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={busy}
              aria-label="やめる"
              title="やめる"
              className="hover:bg-[var(--color-bg-hover)]"
              style={styles.cancel}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="hover:bg-[var(--color-bg-hover)]"
            style={styles.addButton}
          >
            <Plus size={12} />
            追加
          </button>
        ))}
    </>
  );
}

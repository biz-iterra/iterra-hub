"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import type { LookupKind } from "@/actions/lookup";

/**
 * 他のレコードへの紐づけを、詳細ページの項目そのままで付け替えるための欄。
 *
 * 編集ページで直すのはそのレコード自身が持つ情報だけにしてある。
 * 所属や担当のような「どのレコードに繋がっているか」は、全体を保存し直す操作に
 * 紛れ込ませず、その項目だけを意識して選び替える。
 *
 * 保存は呼び出し側から渡す `action` に任せる。既存の update 系 Server Action を
 * そのまま使えるよう、渡す値は 1 つだけに絞ってある（楽観ロックの
 * `expected_updated_at` は呼び出し側で閉じ込める）。
 */

export type RelationOption = { value: string; label: string };

export interface RelationFieldProps {
  label: string;
  /** 今の値の見せ方。リンクを出したいので ReactNode で受ける */
  display: ReactNode;
  /** 今の値の id。未設定なら null */
  value: string | null;
  options: RelationOption[];
  /** 未設定に戻せるか。紐づけが要るものは false */
  nullable?: boolean;
  emptyOptionLabel?: string;
  /** 保存する。成功なら error は null */
  action: (value: string | null) => Promise<{ error: string | null }>;
  /** grid の 2 列を使い切る */
  full?: boolean;
  /** 権限が無いときは鉛筆を出さない */
  editable?: boolean;
  /** 候補が多くて配りきれないものは、打った文字でサーバーから引く */
  searchKind?: LookupKind;
}

const styles = {
  labelRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    marginBottom: "0.25rem",
  } as CSSProperties,
  label: {
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    fontWeight: 600,
  } as CSSProperties,
  value: {
    color: "var(--color-text-body)",
    fontSize: "0.875rem",
    margin: 0,
    lineHeight: 1.6,
    wordBreak: "break-word" as const,
  } as CSSProperties,
  empty: {
    color: "var(--color-sumi400)",
    fontSize: "0.875rem",
    margin: 0,
    lineHeight: 1.6,
  } as CSSProperties,
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.25rem",
    height: "1.25rem",
    border: "none",
    backgroundColor: "transparent",
    borderRadius: "var(--radius-sm)",
    color: "var(--color-sumi500)",
    cursor: "pointer",
    padding: 0,
  } as CSSProperties,
  editRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
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

export function RelationField({
  label,
  display,
  value,
  options,
  nullable = true,
  emptyOptionLabel = "未設定",
  action,
  full = false,
  editable = true,
  searchKind,
}: RelationFieldProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(value ?? "");
    setEditing(true);
  }

  async function save() {
    if (!nullable && !draft) {
      showToast({ type: "error", message: `${label}は必須です` });
      return;
    }
    setSaving(true);
    try {
      const result = await action(draft || null);
      if (result.error) {
        showToast({ type: "error", message: result.error });
        return;
      }
      showToast({ type: "success", message: "保存しました" });
      setEditing(false);
      // 表示を今の紐づけに合わせる。楽観ロックに使う updated_at も引き直す
      router.refresh();
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = display === null || display === undefined || display === "";

  return (
    <div style={full ? { gridColumn: "1 / -1" } : undefined}>
      <div style={styles.labelRow}>
        <span style={styles.label}>{label}</span>
        {editable && !editing && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`${label}を変更`}
            title={`${label}を変更`}
            className="hover:bg-[var(--color-bg-hover)]"
            style={styles.iconButton}
          >
            <Pencil size={12} />
          </button>
        )}
      </div>

      {editing ? (
        <div style={styles.editRow}>
          <SearchableSelect
            value={draft}
            onChange={setDraft}
            options={options}
            // 必須の紐づけでも、まだ入っていない間は空を選べないと詰む
            nullable={nullable || !value}
            emptyOptionLabel={emptyOptionLabel}
            disabled={saving}
            autoFocus
            ariaLabel={label}
            searchKind={searchKind}
          />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            aria-label="保存"
            title="保存"
            style={styles.save}
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            aria-label="やめる"
            title="やめる"
            className="hover:bg-[var(--color-bg-hover)]"
            style={styles.cancel}
          >
            <X size={14} />
          </button>
        </div>
      ) : isEmpty ? (
        <p style={styles.empty}>—</p>
      ) : typeof display === "string" || typeof display === "number" ? (
        <p style={styles.value}>{display}</p>
      ) : (
        <div style={styles.value}>{display}</div>
      )}
    </div>
  );
}

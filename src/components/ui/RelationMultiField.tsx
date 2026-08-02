"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import type { RelationOption } from "@/components/ui/RelationField";

/**
 * 他のレコードへの紐づけのうち、複数選べるもの（副担当など）。
 *
 * 考え方は [RelationField](./RelationField.tsx) と同じで、選び方だけが違う。
 * 相手が数人〜十数人に収まる前提でチップを並べる。数百件を選ぶ用途には向かない。
 */

export interface RelationMultiFieldProps {
  label: string;
  /** 今ついている紐づけ。表示もここから作る */
  values: string[];
  options: RelationOption[];
  /** 保存する。成功なら error は null */
  action: (values: string[]) => Promise<{ error: string | null }>;
  /** 選ぶものが無いときに出す案内 */
  emptyOptionsMessage?: string;
  editable?: boolean;
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
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.375rem",
  } as CSSProperties,
  chip: {
    display: "inline-block",
    padding: "0.125rem 0.625rem",
    borderRadius: "var(--radius-badge)",
    backgroundColor: "var(--color-sumi100)",
    color: "var(--color-sumi700)",
    fontSize: "0.75rem",
    fontWeight: 500,
  } as CSSProperties,
  empty: {
    color: "var(--color-sumi400)",
    fontSize: "0.875rem",
    margin: 0,
  } as CSSProperties,
  picker: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    backgroundColor: "#fff",
  } as CSSProperties,
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    marginTop: "0.5rem",
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
  } as CSSProperties,
};

function chipStyle(checked: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.25rem 0.625rem",
    borderRadius: "var(--radius-badge)",
    backgroundColor: checked ? "rgba(60,63,88,0.12)" : "var(--color-sumi100)",
    color: checked ? "var(--color-terra)" : "var(--color-sumi600)",
    fontSize: "0.8125rem",
    fontWeight: checked ? 600 : 400,
    cursor: "pointer",
    border: checked ? "1px solid rgba(60,63,88,0.25)" : "1px solid transparent",
    userSelect: "none",
  };
}

export function RelationMultiField({
  label,
  values,
  options,
  action,
  emptyOptionsMessage = "選べる相手がいません",
  editable = true,
}: RelationMultiFieldProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>(values);
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft(values);
    setEditing(true);
  }

  function toggle(value: string) {
    setDraft((d) => (d.includes(value) ? d.filter((v) => v !== value) : [...d, value]));
  }

  async function save() {
    setSaving(true);
    try {
      const result = await action(draft);
      if (result.error) {
        showToast({ type: "error", message: result.error });
        return;
      }
      showToast({ type: "success", message: "保存しました" });
      setEditing(false);
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

  const labelOf = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  return (
    <div>
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
        <div>
          {options.length === 0 ? (
            <p style={styles.empty}>{emptyOptionsMessage}</p>
          ) : (
            <div style={styles.picker}>
              {options.map((o) => (
                <label key={o.value} style={chipStyle(draft.includes(o.value))}>
                  <input
                    type="checkbox"
                    checked={draft.includes(o.value)}
                    onChange={() => toggle(o.value)}
                    disabled={saving}
                    style={{ display: "none" }}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          )}
          <div style={styles.actions}>
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
        </div>
      ) : values.length === 0 ? (
        <p style={styles.empty}>—</p>
      ) : (
        <div style={styles.chips}>
          {values.map((v) => (
            <span key={v} style={styles.chip}>
              {labelOf(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

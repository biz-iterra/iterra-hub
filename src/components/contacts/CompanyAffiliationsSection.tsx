"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, X } from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { EntityLink } from "@/components/ui/EntityLink";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { addCompanyAffiliation, removeCompanyAffiliation } from "@/actions/contacts";
import type { CompanyAffiliation } from "@/types/relations";

/**
 * 兼務先。
 *
 * **主たる所属（属性情報の「所属事業者情報」）はここに出ない。** 1 人が
 * 複数の事業者に関わる場合に、その 2 社目以降をここで持つ（2026-08-06）。
 *
 * 主たる所属を替えたいときは属性情報のほうを直す。ここへ同じ事業者を
 * 足そうとすると DB のトリガーが拒む（一覧で二重に出るため）。
 */
export function CompanyAffiliationsSection({
  contactId,
  affiliations,
  companyOptions,
  editable,
}: {
  contactId: string;
  affiliations: CompanyAffiliation[];
  /** 選べる事業者情報。主たる所属は呼び出し側で除いてある */
  companyOptions: { value: string; label: string }[];
  editable: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<CompanyAffiliation | null>(null);

  const reset = () => {
    setAdding(false);
    setCompanyId("");
    setJobTitle("");
  };

  const handleAdd = async () => {
    if (!companyId) {
      showToast({ type: "error", message: "事業者情報を選んでください" });
      return;
    }
    setSaving(true);
    try {
      const res = await addCompanyAffiliation({ contactId, companyId, jobTitle });
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      showToast({ type: "success", message: "兼務先を追加しました" });
      reset();
      router.refresh();
    } catch {
      showToast({ type: "error", message: "兼務先を追加できませんでした" });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!target) return { error: "対象が不明です" };
    const res = await removeCompanyAffiliation({ id: target.id, contactId });
    if (res.error) return { error: res.error };
    showToast({ type: "success", message: "兼務先を外しました" });
    router.refresh();
    return { error: null };
  };

  return (
    <DetailSection title="兼務先" icon={Building2}>
      {affiliations.length === 0 && !adding ? (
        <p style={styles.empty}>兼務先はありません。</p>
      ) : (
        <ul style={styles.list}>
          {affiliations.map((a) => (
            <li key={a.id} style={styles.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {a.company ? (
                  <EntityLink href={`/companies/${a.company.id}`}>{a.company.name}</EntityLink>
                ) : (
                  <span style={styles.empty}>（削除された事業者情報）</span>
                )}
                {a.job_title && <span style={styles.jobTitle}>{a.job_title}</span>}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => setTarget(a)}
                  aria-label="この兼務先を外す"
                  title="この兼務先を外す"
                  style={styles.removeBtn}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable &&
        (adding ? (
          <div style={styles.form}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={styles.label}>事業者情報</label>
              <SearchableSelect
                value={companyId}
                onChange={setCompanyId}
                options={companyOptions}
                searchKind="company"
                ariaLabel="兼務先の事業者情報"
                disabled={saving}
                autoFocus
              />
            </div>
            <div style={{ width: "12rem" }}>
              <label style={styles.label}>役職（任意）</label>
              <input
                style={styles.input}
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={saving}
                placeholder="取締役 など"
                aria-label="兼務先での役職"
              />
            </div>
            <div style={styles.actions}>
              <button type="button" style={styles.primary} onClick={handleAdd} disabled={saving}>
                {saving ? "追加中..." : "追加する"}
              </button>
              <button type="button" style={styles.outline} onClick={reset} disabled={saving}>
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <button type="button" style={styles.addBtn} onClick={() => setAdding(true)}>
            <Plus size={14} />
            兼務先を追加
          </button>
        ))}

      <p style={styles.note}>
        主たる所属は属性情報の「所属事業者情報」で持ちます。ここには
        それ以外に関わる事業者を入れてください。
      </p>

      <ConfirmDialog
        open={target !== null}
        title="兼務先を外す"
        message={
          target
            ? `「${target.company?.name ?? "この事業者情報"}」との兼務を外します。連絡先そのものは残ります。`
            : ""
        }
        confirmLabel="外す"
        danger
        onConfirm={handleRemove}
        onClose={() => setTarget(null)}
      />
    </DetailSection>
  );
}

const styles = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.375rem" } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.625rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
  } as CSSProperties,
  jobTitle: { marginLeft: "0.5rem", fontSize: "0.75rem", color: "var(--color-sumi500)" } as CSSProperties,
  empty: { fontSize: "0.875rem", color: "var(--color-sumi500)", margin: 0 } as CSSProperties,
  note: { fontSize: "0.75rem", color: "var(--color-sumi500)", marginTop: "0.75rem", marginBottom: 0 } as CSSProperties,
  form: {
    display: "flex",
    alignItems: "flex-end",
    gap: "0.5rem",
    flexWrap: "wrap",
    marginTop: "0.625rem",
  } as CSSProperties,
  label: { display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem" } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
  } as CSSProperties,
  actions: { display: "flex", gap: "0.375rem" } as CSSProperties,
  primary: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
  } as CSSProperties,
  outline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
    fontSize: "0.8125rem",
    color: "var(--color-text-body)",
    cursor: "pointer",
  } as CSSProperties,
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    marginTop: "0.625rem",
    backgroundColor: "transparent",
    border: "1px dashed var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.4375rem 0.875rem",
    fontSize: "0.8125rem",
    color: "var(--color-terra)",
    cursor: "pointer",
  } as CSSProperties,
  removeBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.5rem",
    height: "1.5rem",
    border: "none",
    background: "none",
    color: "var(--color-sumi500)",
    cursor: "pointer",
    flexShrink: 0,
  } as CSSProperties,
};

"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { updateTalent, deleteTalent } from "@/actions/talents";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type TalentData = {
  id: string;
  personality_memo: string | null;
  custom_strengths: string | null;
  custom_weaknesses: string | null;
  aptitude_notes: string | null;
  overall_assessment: string | null;
};

const styles = {
  container: {
    padding: "1.5rem",
    maxWidth: 960,
    margin: "0 auto",
  } as CSSProperties,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    marginBottom: "0.75rem",
  } as CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 1rem 0",
  } as CSSProperties,
  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
    marginBottom: "0.25rem",
  } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
  } as CSSProperties,
  textarea: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
    resize: "vertical",
    lineHeight: 1.6,
  } as CSSProperties,
  hint: {
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    margin: "0.25rem 0 0 0",
  } as CSSProperties,
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
  } as CSSProperties,
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-error)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "1rem",
  } as CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
  } as CSSProperties,
};

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "";
  e.currentTarget.style.boxShadow = "";
}

export function TalentEditForm({
  talent,
  contactName,
  isAdmin,
}: {
  talent: TalentData;
  contactName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    personality_memo: talent.personality_memo ?? "",
    custom_strengths: talent.custom_strengths ?? "",
    custom_weaknesses: talent.custom_weaknesses ?? "",
    aptitude_notes: talent.aptitude_notes ?? "",
    overall_assessment: talent.overall_assessment ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      personality_memo: values.personality_memo || null,
      custom_strengths: values.custom_strengths || null,
      custom_weaknesses: values.custom_weaknesses || null,
      aptitude_notes: values.aptitude_notes || null,
      overall_assessment: values.overall_assessment || null,
    };

    const result = await updateTalent(talent.id, payload);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(`/talents/${talent.id}`);
    router.refresh();
  };

  const handleDelete = async () => {
    const result = await deleteTalent(talent.id);
    if (result.error) {
      return { error: result.error };
    }
    router.push("/talents");
    router.refresh();
    return { error: null };
  };

  return (
    <div style={styles.container}>
      <Link
        href={`/talents/${talent.id}`}
        className="hover:bg-[var(--color-bg-hover)]"
        style={{
          ...styles.backLink,
          padding: "0.125rem 0.375rem",
          margin: "-0.125rem -0.375rem",
          borderRadius: "var(--radius-sm)",
          transition: "background-color 0.15s",
        }}
      >
        <ArrowLeft size={16} />
        タレント詳細に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>{contactName} を編集</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 性格分析 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>性格分析</h2>
          <label style={styles.label}>性格メモ</label>
          <textarea
            style={{ ...styles.textarea, minHeight: 140 }}
            value={values.personality_memo}
            onChange={(e) => set("personality_memo", e.target.value)}
            maxLength={5000}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          <p style={styles.hint}>{values.personality_memo.length} / 5000 文字</p>
        </div>

        {/* 強み・弱み */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>強み・弱み</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>強み</label>
              <textarea
                style={{ ...styles.textarea, minHeight: 120 }}
                value={values.custom_strengths}
                onChange={(e) => set("custom_strengths", e.target.value)}
                maxLength={2000}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <p style={styles.hint}>{values.custom_strengths.length} / 2000 文字</p>
            </div>
            <div>
              <label style={styles.label}>弱み</label>
              <textarea
                style={{ ...styles.textarea, minHeight: 120 }}
                value={values.custom_weaknesses}
                onChange={(e) => set("custom_weaknesses", e.target.value)}
                maxLength={2000}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <p style={styles.hint}>{values.custom_weaknesses.length} / 2000 文字</p>
            </div>
          </div>
        </div>

        {/* 適性メモ */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>適性メモ</h2>
          <textarea
            style={{ ...styles.textarea, minHeight: 120 }}
            value={values.aptitude_notes}
            onChange={(e) => set("aptitude_notes", e.target.value)}
            maxLength={2000}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          <p style={styles.hint}>{values.aptitude_notes.length} / 2000 文字</p>
        </div>

        {/* 総合評価 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>総合評価</h2>
          <textarea
            style={{ ...styles.textarea, minHeight: 140 }}
            value={values.overall_assessment}
            onChange={(e) => set("overall_assessment", e.target.value)}
            maxLength={3000}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          <p style={styles.hint}>{values.overall_assessment.length} / 3000 文字</p>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.footer}>
          <div>
            {isAdmin && (
              <button
                type="button"
                style={styles.btnDanger}
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 size={14} />
                削除
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link
              href={`/talents/${talent.id}`}
              style={{ ...styles.btnOutline, textDecoration: "none" }}
            >
              キャンセル
            </Link>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              <Save size={14} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title="タレントを削除"
        message={`「${contactName}」のタレント情報を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createTalent } from "@/actions/talents";
import { useToast } from "@/components/ui/toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { isFieldValidationError } from "@/lib/errors";
import { describeTransportError } from "@/lib/errors";
import { formContainerClass, formActionsClass } from "@/lib/layout";

type SelectOption = { value: string; label: string };

const styles = {
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-terra)",
    textDecoration: "none",
    fontSize: "0.875rem",
    padding: "0.125rem 0.375rem",
    margin: "-0.125rem -0.375rem",
    borderRadius: "var(--radius-sm)",
  } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.25rem",
    marginBottom: "1rem",
  } as CSSProperties,
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
    margin: "0 0 1rem 0",
  } as CSSProperties,
  label: {
    display: "block",
    fontSize: "0.8125rem",
    fontWeight: 500,
    color: "var(--color-sumi700)",
    marginBottom: "0.375rem",
  } as CSSProperties,
  input: {
    width: "100%",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    backgroundColor: "#fff",
  } as CSSProperties,
  textarea: {
    width: "100%",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    minHeight: "5rem",
    resize: "vertical",
    fontFamily: "inherit",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.8125rem",
    margin: "0.5rem 0 0 0",
  } as CSSProperties,
  hint: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
    margin: "0.375rem 0 0 0",
    lineHeight: 1.7,
  } as CSSProperties,
  submit: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.5rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  cancel: {
    color: "var(--color-terra)",
    textDecoration: "none",
    fontSize: "0.875rem",
    padding: "0.5rem 1rem",
  } as CSSProperties,
} as const;

export function TalentNewForm({
  contacts,
  initialContactId = "",
  canCreate,
}: {
  contacts: SelectOption[];
  /** 連絡先の詳細から来たときの初期選択。固定はしない */
  initialContactId?: string;
  canCreate: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [values, setValues] = useState({
    contact_id: initialContactId,
    personality_memo: "",
    custom_strengths: "",
    custom_weaknesses: "",
    aptitude_notes: "",
    overall_assessment: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const result = await createTalent({
        contact_id: values.contact_id,
        personality_memo: values.personality_memo || null,
        custom_strengths: values.custom_strengths || null,
        custom_weaknesses: values.custom_weaknesses || null,
        aptitude_notes: values.aptitude_notes || null,
        overall_assessment: values.overall_assessment || null,
      });

      if (result.error) {
        if (isFieldValidationError(result.error)) {
          setError(result.error);
        } else {
          showToast({ type: "error", message: result.error });
        }
        return;
      }

      showToast({ type: "success", message: "タレントを登録しました" });
      const newId = result.data?.id;
      router.push(newId ? `/talents/${newId}` : "/talents");
    } catch (e) {
      // 応答が返る前に落ちた場合（通信断・タイムアウト）。画面が固まらないようにする
      showToast({ type: "error", message: describeTransportError(e) });
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)" }}>作成権限がありません</p>
      </div>
    );
  }

  return (
    <div className={formContainerClass}>
      <Link href="/talents" style={styles.backLink} className="hover:bg-[var(--color-bg-hover)]">
        <ArrowLeft size={14} />
        タレント一覧へ戻る
      </Link>

      <h1
        className="text-xl sm:text-2xl font-bold"
        style={{ color: "var(--color-text-title)", margin: "0.75rem 0 1rem 0" }}
      >
        タレントの新規登録
      </h1>

      <form onSubmit={handleSubmit}>
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>対象の連絡先</h2>
          <label style={styles.label}>
            連絡先
            <RequiredMark />
          </label>
          <SearchableSelect
            value={values.contact_id}
            onChange={(v) => set("contact_id", v)}
            options={contacts}
            nullable={false}
            searchKind="contact"
            ariaLabel="連絡先"
          />
          <p style={styles.hint}>
            タレント情報は連絡先ひとりに 1 件だけ紐づきます。
            既に登録されている人は候補に出ません。
          </p>
        </div>

        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>人物像</h2>

          <div style={{ marginBottom: "1rem" }}>
            <label style={styles.label} htmlFor="personality_memo">性格分析メモ</label>
            <textarea
              id="personality_memo"
              style={styles.textarea}
              value={values.personality_memo}
              onChange={(e) => set("personality_memo", e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={styles.label} htmlFor="custom_strengths">強み</label>
            <textarea
              id="custom_strengths"
              style={styles.textarea}
              value={values.custom_strengths}
              onChange={(e) => set("custom_strengths", e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={styles.label} htmlFor="custom_weaknesses">弱み</label>
            <textarea
              id="custom_weaknesses"
              style={styles.textarea}
              value={values.custom_weaknesses}
              onChange={(e) => set("custom_weaknesses", e.target.value)}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label style={styles.label} htmlFor="aptitude_notes">適性メモ</label>
            <textarea
              id="aptitude_notes"
              style={styles.textarea}
              value={values.aptitude_notes}
              onChange={(e) => set("aptitude_notes", e.target.value)}
            />
          </div>

          <div>
            <label style={styles.label} htmlFor="overall_assessment">総合評価</label>
            <textarea
              id="overall_assessment"
              style={styles.textarea}
              value={values.overall_assessment}
              onChange={(e) => set("overall_assessment", e.target.value)}
            />
          </div>

          <p style={styles.hint}>
            スキル・経歴・系統やグレードの判定は、登録後の詳細画面から設定します。
          </p>

          {error && <p style={styles.error}>{error}</p>}
        </div>

        <div className={formActionsClass}>
          <Link href="/talents" style={styles.cancel}>
            キャンセル
          </Link>
          <button
            type="submit"
            style={{ ...styles.submit, ...(saving ? { opacity: 0.6, cursor: "not-allowed" } : {}) }}
            disabled={saving || !values.contact_id}
          >
            <Save size={16} />
            {saving ? "登録中..." : "登録"}
          </button>
        </div>
      </form>
    </div>
  );
}

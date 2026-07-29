"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Plus, Pencil, X, Check } from "lucide-react";
import { updateTalent, deleteTalent, addTalentCareer, updateTalentCareer, removeTalentCareer } from "@/actions/talents";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// ---------- 型 ----------

type TalentData = {
  /** 楽観ロック用。編集開始時点の値をそのまま保存時に送り返す */
  updated_at?: string | null;
  id: string;
  personality_memo: string | null;
  custom_strengths: string | null;
  custom_weaknesses: string | null;
  aptitude_notes: string | null;
  overall_assessment: string | null;
};

type CareerRow = {
  id: string;
  talent_id: string;
  career_type: "work" | "education" | "certification";
  organization: string;
  title: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  sort_order: number;
};

type CareerFormValues = {
  career_type: "work" | "education" | "certification";
  organization: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  sort_order: string;
};

// ---------- 定数 ----------

const CAREER_TYPE_LABELS: Record<string, string> = {
  work: "職歴",
  education: "学歴",
  certification: "資格",
};

const CAREER_TYPE_OPTIONS: { value: "work" | "education" | "certification"; label: string }[] = [
  { value: "work", label: "職歴" },
  { value: "education", label: "学歴" },
  { value: "certification", label: "資格" },
];

function emptyCareerForm(nextSortOrder: number): CareerFormValues {
  return {
    career_type: "work",
    organization: "",
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    is_current: false,
    sort_order: String(nextSortOrder),
  };
}

// ---------- スタイル ----------

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
  select: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
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
  btnOutlineSmall: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.25rem 0.625rem",
    cursor: "pointer",
    fontSize: "0.8125rem",
    color: "var(--color-text-body)",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
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
  btnDangerSmall: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.25rem 0.625rem",
    cursor: "pointer",
    fontSize: "0.8125rem",
    color: "var(--color-error)",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
  } as CSSProperties,
  btnAdd: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "transparent",
    border: "1px dashed var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-sumi600)",
    width: "100%",
    justifyContent: "center",
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
  grid3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "1rem",
  } as CSSProperties,
  careerCard: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    padding: "1rem",
    marginBottom: "0.75rem",
    backgroundColor: "var(--color-bg-subtle, #fafafa)",
  } as CSSProperties,
  careerCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.25rem",
  } as CSSProperties,
  badge: {
    display: "inline-block",
    borderRadius: "var(--radius-badge)",
    padding: "0.125rem 0.5rem",
    fontSize: "0.75rem",
    backgroundColor: "var(--color-sumi100)",
    color: "var(--color-sumi700)",
  } as CSSProperties,
  inlineForm: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    padding: "1rem",
    marginBottom: "0.75rem",
    backgroundColor: "#fff",
  } as CSSProperties,
  fieldError: {
    color: "var(--color-error)",
    fontSize: "0.75rem",
    margin: "0.25rem 0 0 0",
  } as CSSProperties,
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
};

// ---------- フォーカスハンドラ ----------

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

// ---------- 経歴フォームバリデーション ----------

function validateCareerForm(v: CareerFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!v.organization.trim()) errors.organization = "組織名は必須です";
  if (v.organization.length > 200) errors.organization = "200文字以内で入力してください";
  if (v.title.length > 200) errors.title = "200文字以内で入力してください";
  if (v.description.length > 2000) errors.description = "2000文字以内で入力してください";
  if (v.is_current && v.end_date) {
    errors.end_date = "現在進行中の場合、終了日は設定できません";
  }
  if (v.start_date && v.end_date && v.end_date < v.start_date) {
    errors.end_date = "終了日は開始日以降にしてください";
  }
  const sortNum = parseInt(v.sort_order, 10);
  if (isNaN(sortNum) || sortNum < 0) errors.sort_order = "0以上の整数を入力してください";
  return errors;
}

// ---------- 経歴フォームコンポーネント ----------

function CareerForm({
  values,
  errors,
  onChange,
  onCancel,
  onSave,
  saving,
  saveLabel = "保存",
}: {
  values: CareerFormValues;
  errors: Record<string, string>;
  onChange: (key: keyof CareerFormValues, value: string | boolean) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
}) {
  return (
    <div style={styles.inlineForm}>
      {/* 1行目: 種別 + 組織 */}
      <div style={{ ...styles.grid, marginBottom: "0.75rem" }}>
        <div>
          <label style={styles.label}>
            種別 <span style={{ color: "var(--color-error)" }}>*</span>
          </label>
          <select
            style={styles.select}
            value={values.career_type}
            onChange={(e) => onChange("career_type", e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            {CAREER_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={styles.label}>
            組織名 <span style={{ color: "var(--color-error)" }}>*</span>
          </label>
          <input
            type="text"
            style={styles.input}
            value={values.organization}
            onChange={(e) => onChange("organization", e.target.value)}
            maxLength={200}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          {errors.organization && <p style={styles.fieldError}>{errors.organization}</p>}
        </div>
      </div>

      {/* 2行目: 役職・タイトル + 表示順 */}
      <div style={{ ...styles.grid, marginBottom: "0.75rem" }}>
        <div>
          <label style={styles.label}>役職・タイトル</label>
          <input
            type="text"
            style={styles.input}
            value={values.title}
            onChange={(e) => onChange("title", e.target.value)}
            maxLength={200}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          {errors.title && <p style={styles.fieldError}>{errors.title}</p>}
        </div>
        <div>
          <label style={styles.label}>表示順</label>
          <input
            type="number"
            style={styles.input}
            value={values.sort_order}
            onChange={(e) => onChange("sort_order", e.target.value)}
            min={0}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          {errors.sort_order && <p style={styles.fieldError}>{errors.sort_order}</p>}
        </div>
      </div>

      {/* 3行目: 開始日 + 終了日 + 現在進行中 */}
      <div style={{ ...styles.grid3, marginBottom: "0.75rem", alignItems: "end" }}>
        <div>
          <label style={styles.label}>開始日</label>
          <input
            type="date"
            style={styles.input}
            value={values.start_date}
            onChange={(e) => onChange("start_date", e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>
        <div>
          <label style={styles.label}>終了日</label>
          <input
            type="date"
            style={{
              ...styles.input,
              backgroundColor: values.is_current ? "var(--color-sumi50, #f5f5f5)" : "#fff",
              color: values.is_current ? "var(--color-sumi400)" : undefined,
            }}
            value={values.end_date}
            onChange={(e) => onChange("end_date", e.target.value)}
            disabled={values.is_current}
            onFocus={onFocus}
            onBlur={onBlur}
          />
          {errors.end_date && <p style={styles.fieldError}>{errors.end_date}</p>}
        </div>
        <div style={{ paddingBottom: "0.125rem" }}>
          <label style={{ ...styles.checkboxRow, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={values.is_current}
              onChange={(e) => {
                onChange("is_current", e.target.checked);
                if (e.target.checked) onChange("end_date", "");
              }}
              style={{ width: 16, height: 16, cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.875rem", color: "var(--color-text-body)" }}>
              現在進行中
            </span>
          </label>
        </div>
      </div>

      {/* 4行目: 説明 */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label style={styles.label}>説明</label>
        <textarea
          style={{ ...styles.textarea, minHeight: 80 }}
          value={values.description}
          onChange={(e) => onChange("description", e.target.value)}
          maxLength={2000}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <p style={styles.hint}>{values.description.length} / 2000 文字</p>
        {errors.description && <p style={styles.fieldError}>{errors.description}</p>}
      </div>

      {/* ボタン */}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" style={styles.btnOutline} onClick={onCancel} disabled={saving}>
          キャンセル
        </button>
        <button
          type="button"
          style={styles.btnPrimary}
          onClick={onSave}
          disabled={saving}
        >
          <Check size={14} />
          {saving ? "保存中..." : saveLabel}
        </button>
      </div>
    </div>
  );
}

// ---------- メインコンポーネント ----------

export function TalentEditForm({
  talent,
  initialCareers,
  contactName,
  isAdmin,
}: {
  talent: TalentData;
  initialCareers: CareerRow[];
  contactName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();

  // ---- タレント基本情報 state ----
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

  // ---- 経歴 state ----
  const [careers, setCareers] = useState<CareerRow[]>(
    [...initialCareers].sort((a, b) => a.sort_order - b.sort_order)
  );

  // 追加フォームの表示/非表示
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addFormValues, setAddFormValues] = useState<CareerFormValues>(() =>
    emptyCareerForm(careers.length > 0 ? Math.max(...careers.map((c) => c.sort_order)) + 10 : 0)
  );
  const [addFormErrors, setAddFormErrors] = useState<Record<string, string>>({});
  const [addSaving, setAddSaving] = useState(false);
  const [careerError, setCareerError] = useState<string | null>(null);

  // 編集フォームの管理 (careerのidをキーに)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormValues, setEditFormValues] = useState<CareerFormValues>(emptyCareerForm(0));
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  // 削除確認
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ---- タレント基本情報 保存 ----
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
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: talent.updated_at ?? undefined,
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

  // ---- 経歴 追加 ----
  const handleAddChange = (key: keyof CareerFormValues, value: string | boolean) => {
    setAddFormValues((v) => ({ ...v, [key]: value }));
    setAddFormErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const handleAddSave = async () => {
    const errors = validateCareerForm(addFormValues);
    if (Object.keys(errors).length > 0) {
      setAddFormErrors(errors);
      return;
    }

    setAddSaving(true);
    setCareerError(null);

    const result = await addTalentCareer({
      talent_id: talent.id,
      career_type: addFormValues.career_type,
      organization: addFormValues.organization,
      title: addFormValues.title || null,
      description: addFormValues.description || null,
      start_date: addFormValues.start_date || null,
      end_date: addFormValues.is_current ? null : addFormValues.end_date || null,
      is_current: addFormValues.is_current,
      sort_order: parseInt(addFormValues.sort_order, 10),
    });

    setAddSaving(false);

    if (result.error) {
      setCareerError(result.error);
      return;
    }

    const newCareer = result.data as CareerRow;
    const next = [...careers, newCareer].sort((a, b) => a.sort_order - b.sort_order);
    setCareers(next);

    const nextSortOrder =
      next.length > 0 ? Math.max(...next.map((c) => c.sort_order)) + 10 : 0;
    setAddFormValues(emptyCareerForm(nextSortOrder));
    setAddFormErrors({});
    setAddFormOpen(false);
    router.refresh();
  };

  const handleAddCancel = () => {
    setAddFormOpen(false);
    setAddFormErrors({});
    const nextSortOrder =
      careers.length > 0 ? Math.max(...careers.map((c) => c.sort_order)) + 10 : 0;
    setAddFormValues(emptyCareerForm(nextSortOrder));
    setCareerError(null);
  };

  // ---- 経歴 編集開始 ----
  const handleEditOpen = (career: CareerRow) => {
    setEditingId(career.id);
    setEditFormValues({
      career_type: career.career_type,
      organization: career.organization,
      title: career.title ?? "",
      description: career.description ?? "",
      start_date: career.start_date ?? "",
      end_date: career.end_date ?? "",
      is_current: career.is_current,
      sort_order: String(career.sort_order),
    });
    setEditFormErrors({});
    setAddFormOpen(false);
  };

  const handleEditChange = (key: keyof CareerFormValues, value: string | boolean) => {
    setEditFormValues((v) => ({ ...v, [key]: value }));
    setEditFormErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    const errors = validateCareerForm(editFormValues);
    if (Object.keys(errors).length > 0) {
      setEditFormErrors(errors);
      return;
    }

    setEditSaving(true);
    setCareerError(null);

    const result = await updateTalentCareer(editingId, {
      career_type: editFormValues.career_type,
      organization: editFormValues.organization,
      title: editFormValues.title || null,
      description: editFormValues.description || null,
      start_date: editFormValues.start_date || null,
      end_date: editFormValues.is_current ? null : editFormValues.end_date || null,
      is_current: editFormValues.is_current,
      sort_order: parseInt(editFormValues.sort_order, 10),
    });

    setEditSaving(false);

    if (result.error) {
      setCareerError(result.error);
      return;
    }

    const updated = result.data as CareerRow;
    const next = careers
      .map((c) => (c.id === editingId ? updated : c))
      .sort((a, b) => a.sort_order - b.sort_order);
    setCareers(next);
    setEditingId(null);
    router.refresh();
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditFormErrors({});
    setCareerError(null);
  };

  // ---- 経歴 削除 ----
  const handleDeleteCareer = async () => {
    if (!deletingId) return { error: null };
    const result = await removeTalentCareer(deletingId);
    if (result.error) return { error: result.error };
    setCareers((prev) => prev.filter((c) => c.id !== deletingId));
    setDeletingId(null);
    router.refresh();
    return { error: null };
  };

  // ---- レンダリング ----
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

      {/* 経歴セクション（form の外 — 個別に保存するため） */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>経歴</h2>

        {careerError && <p style={{ ...styles.error, marginTop: 0, marginBottom: "0.75rem" }}>{careerError}</p>}

        {/* 経歴カード一覧 */}
        {careers.length === 0 && !addFormOpen && (
          <p style={{ color: "var(--color-sumi500)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            経歴が登録されていません。
          </p>
        )}

        {careers.map((career) => {
          if (editingId === career.id) {
            return (
              <CareerForm
                key={career.id}
                values={editFormValues}
                errors={editFormErrors}
                onChange={handleEditChange}
                onCancel={handleEditCancel}
                onSave={handleEditSave}
                saving={editSaving}
                saveLabel="更新"
              />
            );
          }
          return (
            <div key={career.id} style={styles.careerCard}>
              <div style={styles.careerCardHeader}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={styles.badge}>{CAREER_TYPE_LABELS[career.career_type] ?? career.career_type}</span>
                  <span
                    style={{
                      color: "var(--color-text-body)",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                    }}
                  >
                    {career.organization}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <button
                    type="button"
                    style={styles.btnOutlineSmall}
                    onClick={() => handleEditOpen(career)}
                    disabled={editSaving}
                  >
                    <Pencil size={12} />
                    編集
                  </button>
                  <button
                    type="button"
                    style={styles.btnDangerSmall}
                    onClick={() => setDeletingId(career.id)}
                  >
                    <X size={12} />
                    削除
                  </button>
                </div>
              </div>
              {career.title && (
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.8125rem",
                    marginBottom: "0.125rem",
                  }}
                >
                  {career.title}
                </div>
              )}
              <div style={{ color: "var(--color-sumi500)", fontSize: "0.75rem", marginBottom: career.description ? "0.5rem" : 0 }}>
                {career.start_date && new Date(career.start_date).toLocaleDateString("ja-JP")}
                {career.start_date && " 〜 "}
                {career.is_current
                  ? "現在"
                  : career.end_date
                  ? new Date(career.end_date).toLocaleDateString("ja-JP")
                  : career.start_date
                  ? "—"
                  : ""}
                <span style={{ marginLeft: "0.75rem", color: "var(--color-sumi400)" }}>
                  表示順: {career.sort_order}
                </span>
              </div>
              {career.description && (
                <div
                  style={{
                    color: "var(--color-text-body)",
                    fontSize: "0.8125rem",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                    marginTop: "0.25rem",
                  }}
                >
                  {career.description}
                </div>
              )}
            </div>
          );
        })}

        {/* 追加フォーム */}
        {addFormOpen ? (
          <CareerForm
            values={addFormValues}
            errors={addFormErrors}
            onChange={handleAddChange}
            onCancel={handleAddCancel}
            onSave={handleAddSave}
            saving={addSaving}
            saveLabel="追加"
          />
        ) : (
          <button
            type="button"
            style={styles.btnAdd}
            onClick={() => {
              setEditingId(null);
              setCareerError(null);
              const nextSortOrder =
                careers.length > 0
                  ? Math.max(...careers.map((c) => c.sort_order)) + 10
                  : 0;
              setAddFormValues(emptyCareerForm(nextSortOrder));
              setAddFormErrors({});
              setAddFormOpen(true);
            }}
          >
            <Plus size={16} />
            経歴を追加
          </button>
        )}
      </div>

      {/* タレント削除確認 */}
      <ConfirmDialog
        open={confirmDelete}
        title="タレントを削除"
        message={`「${contactName}」のタレント情報を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      {/* 経歴削除確認 */}
      <ConfirmDialog
        open={deletingId !== null}
        title="経歴を削除"
        message="この経歴を削除します。よろしいですか？"
        confirmLabel="削除する"
        danger
        onConfirm={handleDeleteCareer}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}

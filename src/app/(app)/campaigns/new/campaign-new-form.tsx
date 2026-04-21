"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createCampaign } from "@/actions/campaigns";

const styles = {
  container: { padding: "1.5rem", maxWidth: 800, margin: "0 auto" } as CSSProperties,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    marginBottom: "0.75rem",
  } as CSSProperties,
  title: { color: "var(--color-text-title)", fontSize: "1.5rem", fontWeight: 700, margin: 0 } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  label: { display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem" } as CSSProperties,
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
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" } as CSSProperties,
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
  error: { color: "var(--color-error)", fontSize: "0.875rem", margin: "0.75rem 0 0 0" } as CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "0.75rem",
    marginTop: "1rem",
  } as CSSProperties,
};

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

export function CampaignNewForm() {
  const router = useRouter();
  const [values, setValues] = useState({
    name: "",
    type: "" as "generation" | "nurturing" | "qualification" | "",
    description: "",
    start_date: "",
    end_date: "",
    status: "draft" as "draft" | "active" | "paused" | "completed" | "cancelled",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.type) {
      setError("種別を選択してください");
      return;
    }
    setSaving(true);
    setError(null);

    const result = await createCampaign({
      name: values.name,
      type: values.type as "generation" | "nurturing" | "qualification",
      description: values.description || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      status: values.status,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const newId = (result.data as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/campaigns/${newId}`);
    } else {
      router.push("/campaigns");
    }
    router.refresh();
  };

  return (
    <div style={styles.container}>
      <Link
        href="/campaigns"
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
        キャンペーン一覧に戻る
      </Link>
      <div className="flex items-center justify-between mb-6">
        <h1 style={styles.title}>キャンペーンを新規作成</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={styles.card}>
          <h2 style={{ color: "var(--color-text-title)", fontSize: "1rem", fontWeight: 600, margin: "0 0 1rem 0" }}>基本情報</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={styles.label}>キャンペーン名 *</label>
              <input type="text" style={styles.input} value={values.name} onChange={(e) => set("name", e.target.value)} required onFocus={onFocus} onBlur={onBlur} />
            </div>
            <div style={styles.grid2}>
              <div>
                <label style={styles.label}>種別 *</label>
                <select
                  style={styles.input}
                  value={values.type}
                  onChange={(e) => set("type", e.target.value as typeof values.type)}
                  required
                  onFocus={onFocus}
                  onBlur={onBlur}
                >
                  <option value="">-- 選択 --</option>
                  <option value="generation">獲得</option>
                  <option value="nurturing">育成</option>
                  <option value="qualification">選定</option>
                </select>
              </div>
              <div>
                <label style={styles.label}>ステータス</label>
                <select
                  style={styles.input}
                  value={values.status}
                  onChange={(e) => set("status", e.target.value as typeof values.status)}
                  onFocus={onFocus}
                  onBlur={onBlur}
                >
                  <option value="draft">下書き</option>
                  <option value="active">実施中</option>
                  <option value="paused">一時停止</option>
                  <option value="completed">完了</option>
                  <option value="cancelled">中止</option>
                </select>
              </div>
              <div>
                <label style={styles.label}>開始日</label>
                <input type="date" style={styles.input} value={values.start_date} onChange={(e) => set("start_date", e.target.value)} onFocus={onFocus} onBlur={onBlur} />
              </div>
              <div>
                <label style={styles.label}>終了日</label>
                <input type="date" style={styles.input} value={values.end_date} onChange={(e) => set("end_date", e.target.value)} onFocus={onFocus} onBlur={onBlur} />
              </div>
            </div>
            <div>
              <label style={styles.label}>説明</label>
              <textarea
                rows={4}
                style={{ ...styles.input, resize: "vertical" }}
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="キャンペーンの概要や目的..."
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.footer}>
          <Link href="/campaigns" style={{ ...styles.btnOutline, textDecoration: "none" }}>
            キャンセル
          </Link>
          <button type="submit" style={styles.btnPrimary} disabled={saving}>
            <Save size={14} />
            {saving ? "作成中..." : "作成"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { updateCampaign, deleteCampaign } from "@/actions/campaigns";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";
import type { Row } from "@/types/relations";
import { formActionsClass, formContainerClass, fieldGridClass } from "@/lib/layout";

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
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
  grid2: fieldGridClass,
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
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
  } as CSSProperties,
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "transparent",
    color: "#DC2626",
    border: "1px solid #DC2626",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
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

export function CampaignEditClient({
  campaign,
  currentUser,
}: {
  campaign: Row<"campaigns">;
  currentUser: { id: string; full_name: string; role: string };
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const isAdmin = currentUser.role === "admin";

  // ---- フォーム状態 ----
  const [values, setValues] = useState({
    name: campaign.name ?? "",
    type: campaign.type ?? "",
    description: campaign.description ?? "",
    start_date: campaign.start_date ?? "",
    end_date: campaign.end_date ?? "",
    status: campaign.status ?? "draft",
  });
  const [saving, setSaving] = useState(false);
  // フィールドエラー（Zod / マスタ由来）はインラインのまま
  const [error, setError] = useState<string | null>(null);

  // ---- 削除確認ダイアログ ----
  const [deleteOpen, setDeleteOpen] = useState(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await updateCampaign({
      id: campaign.id,
      name: values.name,
      type: values.type as "generation" | "nurturing" | "qualification",
      description: values.description || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      status: values.status as "draft" | "active" | "paused" | "completed" | "cancelled",
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: campaign.updated_at ?? undefined,
    });
    setSaving(false);
    if (result.error) {
      if (isFieldValidationError(result.error)) {
        setError(result.error);
      } else {
        showToast({ type: "error", message: result.error });
      }
      return;
    }
    showToast({ type: "success", message: "保存しました" });
    router.replace(`/campaigns/${campaign.id}`);
  };

  // 削除失敗時はエラーを確認ダイアログ内にインライン表示
  const handleDelete = async (): Promise<{ error: string | null }> => {
    const result = await deleteCampaign(campaign.id);
    if (result.error) return { error: result.error };
    showToast({ type: "success", message: "キャンペーンを削除しました" });
    router.push("/campaigns");
    return { error: null };
  };

  return (
    <div className={formContainerClass}>
      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={deleteOpen}
        title="キャンペーンを削除しますか？"
        message="このキャンペーンを削除します。削除後は管理者のみ復元できます（論理削除）。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />

      {/* Back */}
      <Link
        href={`/campaigns/${campaign.id}`}
        className="hover:bg-[var(--color-bg-hover)]"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          color: "var(--color-sumi600)",
          fontSize: "0.875rem",
          textDecoration: "none",
          marginBottom: "0.75rem",
          padding: "0.125rem 0.375rem",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <ArrowLeft size={16} />
        詳細に戻る
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1
          style={{
            color: "var(--color-text-title)",
            fontSize: "1.5rem",
            fontWeight: 700,
            margin: 0,
          }}
        >
          {campaign.name} — 編集
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* 削除ボタン（admin のみ） */}
          {isAdmin && (
            <button
              type="button"
              style={styles.btnDanger}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={14} />
              削除
            </button>
          )}

          {/* キャンセル */}
          <Link href={`/campaigns/${campaign.id}`} style={styles.btnOutline}>
            キャンセル
          </Link>

          {/* 保存 */}
          <button
            type="button"
            style={styles.btnPrimary}
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {/* === 基本情報 === */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          基本情報
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={styles.label}>キャンペーン名 *</label>
            <input
              type="text"
              style={styles.input}
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
          <div className={styles.grid2}>
            <div>
              <label style={styles.label}>種別</label>
              <select
                style={styles.input}
                value={values.type}
                onChange={(e) => set("type", e.target.value)}
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
                onChange={(e) => set("status", e.target.value)}
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
              <input
                type="date"
                style={styles.input}
                value={values.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>終了日</label>
              <input
                type="date"
                style={styles.input}
                value={values.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
          <div>
            <label style={styles.label}>説明</label>
            <textarea
              rows={4}
              style={{ ...styles.input, resize: "vertical" }}
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
        </div>
      </div>

      {/* ページ下部にも保存・キャンセルボタン */}
      <div className={formActionsClass} style={{ marginTop: "0.5rem" }}>
        <Link href={`/campaigns/${campaign.id}`} style={styles.btnOutline}>
          キャンセル
        </Link>
        <button
          type="button"
          style={styles.btnPrimary}
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={14} />
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

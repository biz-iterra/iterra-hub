"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { updateAccount, deleteAccount } from "@/actions/accounts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  AccountRolesSection,
  type AccountRoleTypeOption,
  type AssignedRole,
} from "./account-roles-section";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerStyle } from "@/lib/layout";

type SelectOption = { value: string; label: string };

type AccountData = {
  /** 楽観ロック用。編集開始時点の値をそのまま保存時に送り返す */
  updated_at?: string | null;
  id: string;
  name: string;
  company_id: string | null;
  account_type_id: string | null;
  account_status_id: string | null;
  lead_source_id: string | null;
  owner_user_id: string | null;
  description: string | null;
};

type Masters = {
  accountTypes: SelectOption[];
  accountStatuses: SelectOption[];
  leadSources: SelectOption[];
  companies: SelectOption[];
  owners: SelectOption[];
};

const styles = {
  container: formContainerStyle,
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
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
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
};

function onFocus(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

export function AccountEditForm({
  account,
  masters,
  isAdmin,
  roleTypes,
  assignedRoles,
}: {
  account: AccountData;
  masters: Masters;
  isAdmin: boolean;
  roleTypes: AccountRoleTypeOption[];
  assignedRoles: AssignedRole[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    name: account.name ?? "",
    company_id: account.company_id ?? "",
    account_type_id: account.account_type_id ?? "",
    account_status_id: account.account_status_id ?? "",
    lead_source_id: account.lead_source_id ?? "",
    owner_user_id: account.owner_user_id ?? "",
    description: account.description ?? "",
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
      name: values.name,
      company_id: values.company_id || null,
      account_type_id: values.account_type_id || null,
      account_status_id: values.account_status_id || undefined,
      lead_source_id: values.lead_source_id || null,
      owner_user_id: values.owner_user_id || null,
      description: values.description || null,
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: account.updated_at ?? undefined,
    };

    const result = await updateAccount(account.id, payload);
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
    router.push(`/accounts/${account.id}`);
    router.refresh();
  };

  const handleDelete = async () => {
    const result = await deleteAccount(account.id);
    if (result.error) {
      return { error: result.error };
    }
    showToast({ type: "success", message: "取引先を削除しました" });
    router.push("/accounts");
    router.refresh();
    return { error: null };
  };

  return (
    <div style={styles.container}>
      <Link
        href={`/accounts/${account.id}`}
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
        取引先詳細に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>取引先を編集</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>取引先名 *</label>
              <input
                type="text"
                style={styles.input}
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>法人情報</label>
              <select
                style={styles.input}
                value={values.company_id}
                onChange={(e) => set("company_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.companies.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>種別</label>
              <select
                style={styles.input}
                value={values.account_type_id}
                onChange={(e) => set("account_type_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.accountTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>ステータス *</label>
              <select
                style={styles.input}
                value={values.account_status_id}
                onChange={(e) => set("account_status_id", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.accountStatuses.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>リードソース</label>
              <select
                style={styles.input}
                value={values.lead_source_id}
                onChange={(e) => set("lead_source_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.leadSources.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>担当者</label>
              <select
                style={styles.input}
                value={values.owner_user_id}
                onChange={(e) => set("owner_user_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.owners.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 区分（保存ボタンとは独立して即時反映する） */}
        <AccountRolesSection
          accountId={account.id}
          roleTypes={roleTypes}
          initialRoles={assignedRoles}
        />

        {/* 説明 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>説明</h2>
          <textarea
            style={{ ...styles.input, minHeight: 120, resize: "vertical" }}
            value={values.description}
            maxLength={1000}
            onChange={(e) => set("description", e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
          />
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
              href={`/accounts/${account.id}`}
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
        title="取引先を削除"
        message={`「${account.name}」を削除します。この操作は取り消せません。アクティブな商談が存在する場合は削除できません。`}
        confirmLabel="削除する"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

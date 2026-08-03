"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { updateContact, deleteContact } from "@/actions/contacts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerStyle } from "@/lib/layout";
import {
  ContactChannelsEditor,
  type ChannelRow,
} from "@/components/contacts/ContactChannelsEditor";
import { AddressesEditor } from "@/components/common/AddressesEditor";
import { SocialAccountsEditor } from "@/components/contacts/SocialAccountsEditor";
import type {
  ContactSocialAccount,
  SocialService,
} from "@/actions/contact-social-accounts";
import type { EntityAddress } from "@/types/relations";

type SelectOption = { value: string; label: string };

type ContactData = {
  /** 楽観ロック用。編集開始時点の値をそのまま保存時に送り返す */
  updated_at?: string | null;
  id: string;
  last_name: string | null;
  middle_name: string | null;
  first_name: string | null;
  last_name_kana: string | null;
  middle_name_kana: string | null;
  first_name_kana: string | null;
  contact_status_id: string | null;
  contact_type: string | null;
  department: string | null;
  job_title: string | null;
  birth_date: string | null;
  blood_type: "A" | "B" | "AB" | "O" | null;
  lead_source_id: string | null;
  line_user_id: string | null;
  internal_memo: string | null;
};

type Masters = {
  contactStatuses: SelectOption[];
  leadSources: SelectOption[];
};

type ContactType = "" | "individual" | "corporate_rep" | "employee" | "other";

const CONTACT_TYPE_OPTIONS: { value: Exclude<ContactType, "">; label: string }[] = [
  { value: "individual", label: "個人" },
  { value: "corporate_rep", label: "法人代表" },
  { value: "employee", label: "法人従業員" },
  { value: "other", label: "その他" },
];

type BloodType = "" | "A" | "B" | "AB" | "O";
const BLOOD_TYPE_OPTIONS: { value: Exclude<BloodType, "">; label: string }[] = [
  { value: "A", label: "A 型" },
  { value: "B", label: "B 型" },
  { value: "AB", label: "AB 型" },
  { value: "O", label: "O 型" },
];

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
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
};

function onFocus(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

export function ContactEditForm({
  contact,
  masters,
  isAdmin,
  emails,
  phones,
  addresses,
  socialServices,
  socialAccounts,
}: {
  contact: ContactData;
  masters: Masters;
  isAdmin: boolean;
  /** 1 人に複数紐づく。本体の保存とは独立して増減させる */
  emails: ChannelRow[];
  phones: ChannelRow[];
  addresses: EntityAddress[];
  socialServices: SocialService[];
  socialAccounts: ContactSocialAccount[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    last_name: contact.last_name ?? "",
    middle_name: contact.middle_name ?? "",
    first_name: contact.first_name ?? "",
    last_name_kana: contact.last_name_kana ?? "",
    middle_name_kana: contact.middle_name_kana ?? "",
    first_name_kana: contact.first_name_kana ?? "",
    contact_status_id: contact.contact_status_id ?? "",
    contact_type: (contact.contact_type ?? "") as ContactType,
    department: contact.department ?? "",
    job_title: contact.job_title ?? "",
    birth_date: contact.birth_date ?? "",
    blood_type: (contact.blood_type ?? "") as BloodType,
    lead_source_id: contact.lead_source_id ?? "",
    line_user_id: contact.line_user_id ?? "",
    internal_memo: contact.internal_memo ?? "",
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
      last_name: values.last_name,
      middle_name: values.middle_name || null,
      first_name: values.first_name,
      last_name_kana: values.last_name_kana || null,
      middle_name_kana: values.middle_name_kana || null,
      first_name_kana: values.first_name_kana || null,
      contact_status_id: values.contact_status_id,
      contact_type: values.contact_type || null,
      department: values.department || null,
      job_title: values.job_title || null,
      birth_date: values.birth_date || null,
      blood_type: values.blood_type || null,
      lead_source_id: values.lead_source_id || null,
      line_user_id: values.line_user_id || null,
      internal_memo: values.internal_memo || null,
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: contact.updated_at ?? undefined,
    };

    try {
      const result = await updateContact(contact.id, payload);
      if (result.error) {
        if (isFieldValidationError(result.error)) {
          setError(result.error);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          showToast({ type: "error", message: result.error });
        }
        setSaving(false);
        return;
      }
      showToast({ type: "success", message: "保存しました" });
      // 遷移先で画面が切り替わるため saving は解除しない（再クリック防止）
      router.push(`/contacts/${contact.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast({ type: "error", message });
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const result = await deleteContact(contact.id);
    if (result.error) {
      return { error: result.error };
    }
    showToast({ type: "success", message: "連絡先を削除しました" });
    router.push("/contacts");
    router.refresh();
    return { error: null };
  };

  const displayName = `${contact.last_name ?? ""} ${contact.first_name ?? ""}`.trim();

  return (
    <div style={styles.container}>
      <Link
        href={`/contacts/${contact.id}`}
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
        連絡先詳細に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>連絡先を編集</h1>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: "var(--color-error-bg, #fdecea)",
            color: "var(--color-error)",
            border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-card)",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            fontSize: "0.875rem",
            whiteSpace: "pre-wrap",
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* 氏名 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>氏名</h2>
          <div style={{ ...styles.grid, gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div>
              <label style={styles.label}>姓 *</label>
              <input
                type="text"
                style={styles.input}
                value={values.last_name}
                onChange={(e) => set("last_name", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>ミドルネーム</label>
              <input
                type="text"
                style={styles.input}
                value={values.middle_name}
                onChange={(e) => set("middle_name", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>名 *</label>
              <input
                type="text"
                style={styles.input}
                value={values.first_name}
                onChange={(e) => set("first_name", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>フリガナ（姓）</label>
              <input
                type="text"
                style={styles.input}
                value={values.last_name_kana}
                onChange={(e) => set("last_name_kana", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>フリガナ（ミドル）</label>
              <input
                type="text"
                style={styles.input}
                value={values.middle_name_kana}
                onChange={(e) => set("middle_name_kana", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>フリガナ（名）</label>
              <input
                type="text"
                style={styles.input}
                value={values.first_name_kana}
                onChange={(e) => set("first_name_kana", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>ステータス *</label>
              <select
                style={styles.input}
                value={values.contact_status_id}
                onChange={(e) => set("contact_status_id", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.contactStatuses.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>種別</label>
              <select
                style={styles.input}
                value={values.contact_type}
                onChange={(e) => set("contact_type", e.target.value as ContactType)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {CONTACT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* 所属事業者情報と担当者は別レコードへの紐づけなので詳細ページで直す */}
            <div>
              <label style={styles.label}>部署</label>
              <input
                type="text"
                style={styles.input}
                value={values.department}
                onChange={(e) => set("department", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>役職</label>
              <input
                type="text"
                style={styles.input}
                value={values.job_title}
                onChange={(e) => set("job_title", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>生年月日</label>
              <input
                type="date"
                style={styles.input}
                value={values.birth_date}
                onChange={(e) => set("birth_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>血液型</label>
              <select
                style={styles.input}
                value={values.blood_type}
                onChange={(e) => set("blood_type", e.target.value as BloodType)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {BLOOD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
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
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 連絡手段。1 人に複数紐づくので行単位で増減できるようにする */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>連絡手段</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <ContactChannelsEditor
              contactId={contact.id}
              channel="email"
              rows={emails}
            />
            <ContactChannelsEditor
              contactId={contact.id}
              channel="phone"
              rows={phones}
            />
          </div>
        </div>

        {/*
          SNS・チャットの連絡口。サービスによって入れるものが違う
          （LINE ID / Chatwork のルーム ID / Slack はワークスペース + メンバー ID）ので、
          選んだサービスに合わせて欄が変わる。
        */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>SNS・チャット</h2>
          <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", margin: "0 0 0.75rem 0" }}>
            登録すると詳細ページから相手ひとりとのやり取りを直接開けます。
            追加・削除はこの場で反映されます（下の「保存」を待ちません）。
          </p>
          <SocialAccountsEditor
            contactId={contact.id}
            services={socialServices}
            accounts={socialAccounts}
          />
        </div>

        {/* 住所。addresses マスタに持ち、自宅・勤務先などを分けて登録する */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>住所</h2>
          <AddressesEditor
            ownerType="contact"
            ownerId={contact.id}
            addresses={addresses}
          />
        </div>

        {/* その他情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>その他情報</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>LINE User ID</label>
              <input
                type="text"
                style={styles.input}
                value={values.line_user_id}
                onChange={(e) => set("line_user_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* メモ */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>メモ</h2>
          <textarea
            style={{ ...styles.input, minHeight: 120, resize: "vertical" }}
            value={values.internal_memo}
            onChange={(e) => set("internal_memo", e.target.value)}
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
              href={`/contacts/${contact.id}`}
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
        title="連絡先を削除"
        message={`「${displayName || "この連絡先"}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

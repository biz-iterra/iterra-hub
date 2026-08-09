"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createContact } from "@/actions/contacts";
import { useToast } from "@/components/ui/toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerClass, fieldGridClass, fieldGrid3Class, formActionsClass } from "@/lib/layout";
import { RequiredMark } from "@/components/ui/RequiredMark";
import {
  ContactChannelsDraft,
  type ChannelDraft,
} from "@/components/contacts/ContactChannelsDraft";
import {
  ContactSocialAccountsDraft,
  type SocialAccountDraft,
} from "@/components/contacts/ContactSocialAccountsDraft";
import type { SocialService } from "@/actions/contact-social-accounts";

type SelectOption = { value: string; label: string };

type Masters = {
  contactStatuses: SelectOption[];
  leadSources: SelectOption[];
  companies: SelectOption[];
  owners: SelectOption[];
};

type ContactType = "" | "individual" | "corporate_rep" | "employee" | "other";
type BloodType = "" | "A" | "B" | "AB" | "O";
const BLOOD_TYPE_OPTIONS: { value: Exclude<BloodType, "">; label: string }[] = [
  { value: "A", label: "A 型" },
  { value: "B", label: "B 型" },
  { value: "AB", label: "AB 型" },
  { value: "O", label: "O 型" },
];

const CONTACT_TYPE_OPTIONS: { value: Exclude<ContactType, "">; label: string }[] = [
  { value: "individual", label: "個人" },
  { value: "corporate_rep", label: "法人代表" },
  { value: "employee", label: "法人従業員" },
  { value: "other", label: "その他" },
];

const styles = {
  container: formContainerClass,
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
  grid: fieldGridClass,
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
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
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

/** SNS・チャットの下書き 1 件を検査する。SocialAccountsEditor の validate() と揃える */
function validateSocialAccountDraft(
  row: SocialAccountDraft,
  services: SocialService[]
): string | null {
  if (!row.service_id) return "SNS・チャットのサービスを選んでください";
  if (!row.account_id.trim()) return "SNS・チャットの ID を入力してください";
  const service = services.find((s) => s.id === row.service_id);
  if (service?.requires_workspace && !row.workspace.trim()) {
    return `SNS・チャットの${service.workspace_label}を入力してください`;
  }
  return null;
}

export function ContactNewForm({
  masters,
  socialServices,
  initialCompanyId = "",
  initialAccountId = "",
  defaultOwnerUserId,
}: {
  masters: Masters;
  /** SNS・チャットのサービスマスタ。選んだサービスで入力欄が変わる */
  socialServices: SocialService[];
  /** 担当者の既定値（ログイン中の利用者） */
  defaultOwnerUserId?: string;
  /** 事業者情報の詳細から来たときの初期選択。固定はしない（付け替えられる） */
  initialCompanyId?: string;
  /** 取引先の詳細から来たときの紐づけ先。account_contacts に張られる */
  initialAccountId?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    last_name: "",
    middle_name: "",
    first_name: "",
    last_name_kana: "",
    middle_name_kana: "",
    first_name_kana: "",
    contact_status_id: "",
    contact_type: "" as ContactType,
    company_id: initialCompanyId,
    department: "",
    job_title: "",
    birth_date: "",
    blood_type: "" as BloodType,
    lead_source_id: "",
    line_user_id: "",
    // **担当者はログイン中の利用者を既定にする。**
    // 自分が起票したものを自分に付けるのが大半で、毎回選ばせると付け忘れが出る
    owner_user_id: defaultOwnerUserId ?? "",
    internal_memo: "",
  });
  // 連絡手段と住所は別テーブルだが、**作成時にまとめて登録する**（編集画面と揃える）。
  // 書き込みは DB 関数 create_contact_with_details が単一トランザクションで行う
  const [emails, setEmails] = useState<ChannelDraft[]>([]);
  const [phones, setPhones] = useState<ChannelDraft[]>([]);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccountDraft[]>([]);
  const [address, setAddress] = useState({
    postal_code: "",
    prefecture: "",
    city: "",
    address_line1: "",
    address_line2: "",
    label: "main",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K],
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // 完全な空行（サービス未選択かつ ID 未入力）は無視する。
    // それ以外は入りかけとみなし、揃っていなければ送信前に止める
    // （SocialAccountsEditor の validate() と揃える）
    const socialAccountRows = socialAccounts.filter(
      (r) => r.service_id !== "" || r.account_id.trim() !== ""
    );
    for (const row of socialAccountRows) {
      const message = validateSocialAccountDraft(row, socialServices);
      if (message) {
        setError(message);
        return;
      }
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      last_name: values.last_name,
      middle_name: values.middle_name || null,
      first_name: values.first_name,
      last_name_kana: values.last_name_kana || null,
      middle_name_kana: values.middle_name_kana || null,
      first_name_kana: values.first_name_kana || null,
      contact_status_id: values.contact_status_id,
      contact_type: values.contact_type || null,
      company_id: values.company_id || null,
      department: values.department || null,
      job_title: values.job_title || null,
      birth_date: values.birth_date || null,
      blood_type: values.blood_type || null,
      lead_source_id: values.lead_source_id || null,
      line_user_id: values.line_user_id || null,
      owner_user_id: values.owner_user_id || null,
      internal_memo: values.internal_memo || null,
      // 取引先から来たときだけ紐づけを渡す（account_contacts は DB 関数が張る）
      account_id: initialAccountId || null,
      // 空行は送らない。DB 関数は受け取った分だけ書く
      emails: emails
        .filter((r) => r.value.trim() !== "")
        .map((r) => ({ email: r.value.trim(), label: r.label, is_primary: r.is_primary })),
      phones: phones
        .filter((r) => r.value.trim() !== "")
        .map((r) => ({ phone: r.value.trim(), label: r.label, is_primary: r.is_primary })),
      social_accounts: socialAccountRows.map((r) => ({
        service_id: r.service_id,
        account_id: r.account_id.trim(),
        workspace: r.workspace.trim() || null,
        display_name: r.display_name.trim() || null,
      })),
      address,
    };

    const result = await createContact(payload);
    setSaving(false);
    if (result.error) {
      if (isFieldValidationError(result.error)) {
        setError(result.error);
      } else {
        showToast({ type: "error", message: result.error });
      }
      return;
    }
    showToast({ type: "success", message: "連絡先を作成しました" });
    // router.push の直後に router.refresh() を呼ぶと、進行中のナビゲーションが
    // 現在ルートの再フェッチに差し替わって遷移が起きない。キャッシュの更新は
    // Server Action 側の revalidatePath に任せる（2026-08-03 修正）
    const newId = (result.data as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/contacts/${newId}`);
    } else {
      router.push("/contacts");
    }
  };

  return (
    <div className={styles.container}>
      <Link
        href="/contacts"
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
        連絡先一覧に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>連絡先を新規作成</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 氏名 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>氏名</h2>
          <div className={fieldGrid3Class}>
            <div>
              <label style={styles.label}>姓<RequiredMark /></label>
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
              <label style={styles.label}>名<RequiredMark /></label>
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
              <label style={styles.label}>フリガナ(姓)</label>
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
              <label style={styles.label}>フリガナ(ミドル)</label>
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
              <label style={styles.label}>フリガナ(名)</label>
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
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>ステータス<RequiredMark /></label>
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
            <div>
              <label style={styles.label}>所属事業者情報</label>
              <SearchableSelect
                value={values.company_id}
                onChange={(v) => set("company_id", v)}
                options={masters.companies}
                nullable={true}
                searchKind="company"
                ariaLabel="所属事業者情報"
              />
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
                <option value="">-- 未指定 --</option>
                {masters.owners.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
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

        {/* 連絡手段。編集画面と同じ項目を作成時にも置く */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>連絡手段</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <ContactChannelsDraft channel="email" rows={emails} onChange={setEmails} />
            <ContactChannelsDraft channel="phone" rows={phones} onChange={setPhones} />
            <ContactSocialAccountsDraft
              services={socialServices}
              rows={socialAccounts}
              onChange={setSocialAccounts}
            />
          </div>
        </div>

        {/* 住所。作成時は 1 件だけ。2 件目以降は編集画面で足す */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>住所</h2>
          <div className={styles.grid}>
            <div>
              <label style={styles.label} htmlFor="postal_code">郵便番号</label>
              <input
                id="postal_code"
                value={address.postal_code}
                onChange={(e) => setAddress((a) => ({ ...a, postal_code: e.target.value }))}
                style={styles.input}
                placeholder="100-0001"
              />
            </div>
            <div>
              <label style={styles.label} htmlFor="prefecture">都道府県</label>
              <input
                id="prefecture"
                value={address.prefecture}
                onChange={(e) => setAddress((a) => ({ ...a, prefecture: e.target.value }))}
                style={styles.input}
                placeholder="東京都"
              />
            </div>
            <div>
              <label style={styles.label} htmlFor="city">市区町村</label>
              <input
                id="city"
                value={address.city}
                onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                style={styles.input}
                placeholder="千代田区"
              />
            </div>
            <div>
              <label style={styles.label} htmlFor="address_line1">町名・番地</label>
              <input
                id="address_line1"
                value={address.address_line1}
                onChange={(e) => setAddress((a) => ({ ...a, address_line1: e.target.value }))}
                style={styles.input}
                placeholder="丸の内1-1-1"
              />
            </div>
            <div>
              <label style={styles.label} htmlFor="address_line2">建物名・部屋番号</label>
              <input
                id="address_line2"
                value={address.address_line2}
                onChange={(e) => setAddress((a) => ({ ...a, address_line2: e.target.value }))}
                style={styles.input}
                placeholder="ITERRA ビル 5F"
              />
            </div>
            <div>
              <label style={styles.label} htmlFor="address_label">種別</label>
              <select
                id="address_label"
                value={address.label}
                onChange={(e) => setAddress((a) => ({ ...a, label: e.target.value }))}
                style={styles.input}
              >
                <option value="main">主住所</option>
                <option value="home">自宅</option>
                <option value="billing">請求先</option>
                <option value="shipping">配送先</option>
                <option value="branch">支店</option>
                <option value="other">その他</option>
              </select>
            </div>
          </div>
          <p style={{ color: "var(--color-sumi500)", fontSize: "0.75rem", margin: "0.5rem 0 0 0" }}>
            2 件目以降の住所は作成後に編集画面から追加できます。
          </p>
        </div>

        {/* その他情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>その他情報</h2>
          <div className={styles.grid}>
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

        <div className={formActionsClass}>
          <Link
            href="/contacts"
            style={{ ...styles.btnOutline, textDecoration: "none" }}
          >
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

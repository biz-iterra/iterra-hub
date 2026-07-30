"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createCompany } from "@/actions/companies";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";

type SelectOption = { value: string; label: string };

type Masters = {
  corporateTypes: SelectOption[];
  leadSources: SelectOption[];
  companyStatuses: SelectOption[];
  owners: SelectOption[];
};

const PREFECTURES = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県",
  "岐阜県","静岡県","愛知県","三重県",
  "滋賀県","京都府","大阪府","兵庫県","奈良県","和歌山県",
  "鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県",
  "福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県",
];

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
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "0.75rem",
    marginTop: "1rem",
  } as CSSProperties,
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
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

export function CompanyNewForm({ masters }: { masters: Masters }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    name: "",
    name_kana: "",
    representative_name: "",
    corporate_type_id: "",
    company_status_id: "",
    lead_source_id: "",
    owner_user_id: "",
    corporate_number: "",
    invoice_registration_number: "",
    postal_code: "",
    prefecture: "",
    city: "",
    address_line1: "",
    address_line2: "",
    phone: "",
    fax: "",
    website_url: "",
    internal_memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  // 法人番号（13桁数字）を入力したらインボイス番号を T+法人番号 で自動補完する。
  // 既に invoice_registration_number に手入力があれば上書きしない。
  const onCorporateNumberChange = (raw: string) => {
    setValues((v) => {
      const next = { ...v, corporate_number: raw };
      if (/^\d{13}$/.test(raw) && !v.invoice_registration_number) {
        next.invoice_registration_number = `T${raw}`;
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      name: values.name,
      name_kana: values.name_kana || null,
      representative_name: values.representative_name || null,
      corporate_type_id: values.corporate_type_id || null,
      company_status_id: values.company_status_id,
      lead_source_id: values.lead_source_id || null,
      owner_user_id: values.owner_user_id || null,
      corporate_number: values.corporate_number || null,
      invoice_registered: !!values.invoice_registration_number,
      invoice_registration_number: values.invoice_registration_number || null,
      postal_code: values.postal_code || null,
      prefecture: values.prefecture || null,
      city: values.city || null,
      address_line1: values.address_line1 || null,
      address_line2: values.address_line2 || null,
      phone: values.phone || null,
      fax: values.fax || null,
      website_url: values.website_url || null,
      internal_memo: values.internal_memo || null,
    };

    const result = await createCompany(payload);
    setSaving(false);
    if (result.error) {
      if (isFieldValidationError(result.error)) {
        setError(result.error);
      } else {
        showToast({ type: "error", message: result.error });
      }
      return;
    }
    showToast({ type: "success", message: "会社情報を作成しました" });
    const newId = (result.data as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/companies/${newId}`);
    } else {
      router.push("/companies");
    }
    router.refresh();
  };

  return (
    <div style={styles.container}>
      <Link
        href="/companies"
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
        会社情報一覧に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>会社情報を新規作成</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>会社名 *</label>
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
              <label style={styles.label}>フリガナ</label>
              <input
                type="text"
                style={styles.input}
                value={values.name_kana}
                onChange={(e) => set("name_kana", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>代表者名</label>
              <input
                type="text"
                style={styles.input}
                value={values.representative_name}
                onChange={(e) => set("representative_name", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>法人格</label>
              <select
                style={styles.input}
                value={values.corporate_type_id}
                onChange={(e) => set("corporate_type_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.corporateTypes.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>法人番号（13桁）</label>
              <input
                type="text"
                style={styles.input}
                placeholder="1234567890123"
                value={values.corporate_number}
                onChange={(e) => onCorporateNumberChange(e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>ステータス *</label>
              <select
                style={styles.input}
                value={values.company_status_id}
                onChange={(e) => set("company_status_id", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.companyStatuses.map((o) => (
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
            <div>
              <label style={styles.label}>社内担当者</label>
              <select
                style={styles.input}
                value={values.owner_user_id}
                onChange={(e) => set("owner_user_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.owners.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 住所 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>住所</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>郵便番号</label>
              <input
                type="text"
                style={styles.input}
                placeholder="000-0000"
                value={values.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>都道府県</label>
              <select
                style={styles.input}
                value={values.prefecture}
                onChange={(e) => set("prefecture", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {PREFECTURES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>市区町村</label>
              <input
                type="text"
                style={styles.input}
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>番地</label>
              <input
                type="text"
                style={styles.input}
                value={values.address_line1}
                onChange={(e) => set("address_line1", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>建物名</label>
              <input
                type="text"
                style={styles.input}
                value={values.address_line2}
                onChange={(e) => set("address_line2", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* 連絡先 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>連絡先</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>代表電話</label>
              <input
                type="text"
                style={styles.input}
                value={values.phone}
                onChange={(e) => set("phone", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>FAX</label>
              <input
                type="text"
                style={styles.input}
                value={values.fax}
                onChange={(e) => set("fax", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>ホームページURL</label>
              <input
                type="url"
                style={styles.input}
                value={values.website_url}
                onChange={(e) => set("website_url", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* インボイス */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>インボイス</h2>
          <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", margin: "0 0 0.75rem 0" }}>
            登録番号の有無で登録ステータスを自動判定します。基本情報の法人番号を 13 桁入力すると登録番号が自動で補完されます。
          </p>
          <div>
            <label style={styles.label}>インボイス登録番号（T+13桁）</label>
            <input
              type="text"
              style={styles.input}
              placeholder="T1234567890123"
              value={values.invoice_registration_number}
              onChange={(e) => set("invoice_registration_number", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
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
          <Link
            href="/companies"
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

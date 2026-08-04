"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createCompany, suggestCompanyKana } from "@/actions/companies";
import { useToast } from "@/components/ui/toast";
import { detectCorporateType } from "@/lib/company-name";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerClass, fieldGridClass, formActionsClass } from "@/lib/layout";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { isSoleProprietorSelected } from "@/lib/company-type";

type SelectOption = { value: string; label: string };

type Masters = {
  corporateTypes: SelectOption[];
  leadSources: SelectOption[];
  companyStatuses: SelectOption[];
  owners: SelectOption[];
};

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

  // 会社名を入力し終えたらフリガナの下書きを入れる。
  // 形態素解析の読みなので正確とは限らない。人が入れた値は上書きしない
  const fillKana = async () => {
    if (!values.name.trim() || values.name_kana.trim()) return;
    const { data } = await suggestCompanyKana(values.name);
    if (data) set("name_kana", data);
  };

  // 個人事業主は法人番号を持たないので、法人番号の欄を出さない
  const isSoleProprietor = isSoleProprietorSelected(
    masters.corporateTypes,
    values.corporate_type_id
  );

  // 会社名に法人格の綴りが含まれていれば法人格を選んでおく。
  // 既に選ばれていれば触らない（人が選んだ値を上書きしない）。
  // 保存時にも Server Action 側で同じ補完をするので、ここは確認のための先出し。
  const onNameChange = (raw: string) => {
    setValues((v) => {
      const next = { ...v, name: raw };
      if (!v.corporate_type_id) {
        next.corporate_type_id =
          detectCorporateType(
            raw,
            masters.corporateTypes.map((o) => ({ id: o.value, name: o.label }))
          )?.id ?? "";
      }
      return next;
    });
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
      invoice_registration_number: values.invoice_registration_number || null,
      invoice_registered: !!values.invoice_registration_number,
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
    showToast({ type: "success", message: "事業者情報を作成しました" });
    const newId = (result.data as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/companies/${newId}`);
    } else {
      router.push("/companies");
    }
  };

  return (
    <div className={styles.container}>
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
        事業者情報一覧に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>事業者情報を新規作成</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div className={styles.grid}>
            <div>
              {/* 個人事業主は法人ではないので「会社名」と呼ばない（§22.2.1） */}
              <label style={styles.label}>
                {isSoleProprietor ? "屋号" : "会社名"}
                <RequiredMark />
              </label>
              <input
                type="text"
                style={styles.input}
                value={values.name}
                onChange={(e) => onNameChange(e.target.value)}
                required
                onFocus={onFocus}
                onBlur={(e) => {
                  onBlur(e);
                  void fillKana();
                }}
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
            {/* 個人事業主は本人しかいないので代表者を別に持たない。
                代表者の連絡先への紐づけは詳細画面から行う（作成時点では
                その会社の連絡先がまだ無いため、ここは自由入力のまま） */}
            {!isSoleProprietor && (
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
                <p
                  style={{
                    fontSize: "0.6875rem",
                    color: "var(--color-sumi500)",
                    margin: "0.25rem 0 0 0",
                  }}
                >
                  連絡先（法人代表）への紐づけは、作成後に詳細画面から選べます。
                </p>
              </div>
            )}
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
            {/* 個人事業主は法人番号を持たない。インボイス登録番号は別途入力できる */}
            {!isSoleProprietor && (
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
            )}
            <div>
              <label style={styles.label}>ステータス<RequiredMark /></label>
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

        {/* 住所は作成後に登録する。addresses マスタへ紐づけるため相手の ID が要る */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>住所</h2>
          <p style={{ color: "var(--color-sumi600)", fontSize: "0.875rem", margin: 0 }}>
            住所は作成後に編集画面から登録できます（本社・支店・請求先など複数を登録できます）。
          </p>
        </div>

        {/* 連絡先 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>連絡先</h2>
          <div className={styles.grid}>
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

        <div className={formActionsClass}>
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

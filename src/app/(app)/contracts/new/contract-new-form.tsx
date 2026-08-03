"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createContract } from "@/actions/contracts";
import { useToast } from "@/components/ui/toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerClass, fieldGridClass, formActionsClass } from "@/lib/layout";

type SelectOption = { value: string; label: string };

type Masters = {
  contractTypes: SelectOption[];
  deals: SelectOption[];
  companies: SelectOption[];
  contacts: SelectOption[];
  users: SelectOption[];
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

const CONTRACT_METHODS: SelectOption[] = [
  { value: "paper", label: "紙面" },
  { value: "electronic", label: "電子" },
  { value: "verbal", label: "口頭" },
];

const COUNTERPARTY_TYPES: SelectOption[] = [
  { value: "company", label: "法人" },
  { value: "individual", label: "個人" },
];

export function ContractNewForm({ masters }: { masters: Masters }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    deal_id: "",
    contract_method: "",
    contract_type_id: "",
    contract_name: "",
    counterparty_type: "",
    counterparty_company_id: "",
    counterparty_contact_id: "",
    counterparty_manager_id: "",
    contract_content: "",
    sent_date: "",
    signback_date: "",
    execution_date: "",
    start_date: "",
    end_date: "",
    cancellation_date: "",
    auto_renewal: false,
    original_document_url: "",
    contract_url: "",
    registered_by: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K]
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!values.deal_id) {
      setError("商談は必須です");
      setSaving(false);
      return;
    }

    const payload = {
      deal_id: values.deal_id,
      contract_method:
        values.contract_method === ""
          ? null
          : (values.contract_method as "paper" | "electronic" | "verbal"),
      contract_type_id: values.contract_type_id || null,
      contract_name: values.contract_name || null,
      counterparty_type:
        values.counterparty_type === ""
          ? null
          : (values.counterparty_type as "company" | "individual"),
      counterparty_company_id: values.counterparty_company_id || null,
      counterparty_contact_id: values.counterparty_contact_id || null,
      counterparty_manager_id: values.counterparty_manager_id || null,
      contract_content: values.contract_content || null,
      sent_date: values.sent_date || null,
      signback_date: values.signback_date || null,
      execution_date: values.execution_date || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      cancellation_date: values.cancellation_date || null,
      auto_renewal: values.auto_renewal,
      original_document_url: values.original_document_url || null,
      contract_url: values.contract_url || null,
      registered_by: values.registered_by || null,
    };

    const result = await createContract(payload);
    setSaving(false);
    if (result.error) {
      if (isFieldValidationError(result.error)) {
        setError(result.error);
      } else {
        showToast({ type: "error", message: result.error });
      }
      return;
    }
    showToast({ type: "success", message: "契約を作成しました" });
    const newId = (result.data as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/contracts/${newId}`);
    } else {
      router.push("/contracts");
    }
    router.refresh();
  };

  return (
    <div className={styles.container}>
      <Link
        href="/contracts"
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
        契約一覧に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>契約を新規作成</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>商談 *</label>
              <SearchableSelect
                value={values.deal_id}
                onChange={(v) => set("deal_id", v)}
                options={masters.deals}
                nullable={false}
                searchKind="deal"
                ariaLabel="商談"
              />
            </div>
            <div>
              <label style={styles.label}>契約書名</label>
              <input
                type="text"
                style={styles.input}
                value={values.contract_name}
                onChange={(e) => set("contract_name", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約方法</label>
              <select
                style={styles.input}
                value={values.contract_method}
                onChange={(e) => set("contract_method", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {CONTRACT_METHODS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>契約種別</label>
              <select
                style={styles.input}
                value={values.contract_type_id}
                onChange={(e) => set("contract_type_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.contractTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>契約内容</label>
              <textarea
                style={{ ...styles.input, minHeight: 120, resize: "vertical" }}
                maxLength={5000}
                value={values.contract_content}
                onChange={(e) => set("contract_content", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* 契約相手先 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>契約相手先</h2>
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>契約相手先区分</label>
              <select
                style={styles.input}
                value={values.counterparty_type}
                onChange={(e) => set("counterparty_type", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {COUNTERPARTY_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>相手先の事業者情報</label>
              <SearchableSelect
                value={values.counterparty_company_id}
                onChange={(v) => set("counterparty_company_id", v)}
                options={masters.companies}
                nullable={true}
                searchKind="company"
                ariaLabel="相手先の事業者情報"
              />
            </div>
            <div>
              <label style={styles.label}>相手先の連絡先(個人)</label>
              <SearchableSelect
                value={values.counterparty_contact_id}
                onChange={(v) => set("counterparty_contact_id", v)}
                options={masters.contacts}
                nullable={true}
                searchKind="contact"
                ariaLabel="相手先の連絡先"
              />
            </div>
            <div>
              <label style={styles.label}>先方窓口担当</label>
              <SearchableSelect
                value={values.counterparty_manager_id}
                onChange={(v) => set("counterparty_manager_id", v)}
                options={masters.contacts}
                nullable={true}
                searchKind="contact"
                ariaLabel="先方窓口担当"
              />
            </div>
          </div>
        </div>

        {/* 日程 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>日程</h2>
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>契約送付日</label>
              <input
                type="date"
                style={styles.input}
                value={values.sent_date}
                onChange={(e) => set("sent_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>サインバック日</label>
              <input
                type="date"
                style={styles.input}
                value={values.signback_date}
                onChange={(e) => set("signback_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約締結日</label>
              <input
                type="date"
                style={styles.input}
                value={values.execution_date}
                onChange={(e) => set("execution_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約開始日</label>
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
              <label style={styles.label}>契約終了日</label>
              <input
                type="date"
                style={styles.input}
                value={values.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>解約日</label>
              <input
                type="date"
                style={styles.input}
                value={values.cancellation_date}
                onChange={(e) => set("cancellation_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={styles.checkboxRow}>
              <input
                id="auto_renewal"
                type="checkbox"
                checked={values.auto_renewal}
                onChange={(e) => set("auto_renewal", e.target.checked)}
              />
              <label
                htmlFor="auto_renewal"
                style={{ ...styles.label, marginBottom: 0 }}
              >
                自動更新
              </label>
            </div>
          </div>
        </div>

        {/* URL / 登録者 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>URL・登録者</h2>
          <div className={styles.grid}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>原本URL</label>
              <input
                type="url"
                style={styles.input}
                value={values.original_document_url}
                onChange={(e) =>
                  set("original_document_url", e.target.value)
                }
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>契約書URL</label>
              <input
                type="url"
                style={styles.input}
                value={values.contract_url}
                onChange={(e) => set("contract_url", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>登録者</label>
              <select
                style={styles.input}
                value={values.registered_by}
                onChange={(e) => set("registered_by", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.users.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div className={formActionsClass}>
          <Link
            href="/contracts"
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

"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createDeal } from "@/actions/deals";

type SelectOption = { value: string; label: string };
type StageOption = SelectOption & { pipeline_type_id: string };
type StatusOption = SelectOption & { pipeline_type_id: string };

type Masters = {
  pipelineTypes: SelectOption[];
  dealStages: StageOption[];
  dealStatuses: StatusOption[];
  accounts: SelectOption[];
  owners: SelectOption[];
};

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

export function DealNewForm({ masters }: { masters: Masters }) {
  const router = useRouter();
  const [values, setValues] = useState({
    name: "",
    pipeline_type_id: "",
    deal_stage_id: "",
    deal_status_id: "",
    amount: "",
    account_id: "",
    owner_user_id: "",
    contract_name: "",
    application_date: "",
    review_completed_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K]
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const filteredStages = useMemo(
    () =>
      masters.dealStages.filter(
        (s) => s.pipeline_type_id === values.pipeline_type_id
      ),
    [masters.dealStages, values.pipeline_type_id]
  );

  const filteredStatuses = useMemo(
    () =>
      masters.dealStatuses.filter(
        (s) => s.pipeline_type_id === values.pipeline_type_id
      ),
    [masters.dealStatuses, values.pipeline_type_id]
  );

  const handlePipelineChange = (nextId: string) => {
    setValues((v) => ({
      ...v,
      pipeline_type_id: nextId,
      deal_stage_id: "",
      deal_status_id: "",
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const amountNum = values.amount.trim() === "" ? null : Number(values.amount);
    if (amountNum !== null && (Number.isNaN(amountNum) || amountNum < 0)) {
      setSaving(false);
      setError("金額は 0 以上の数値を入力してください");
      return;
    }

    const payload = {
      name: values.name,
      pipeline_type_id: values.pipeline_type_id,
      deal_stage_id: values.deal_stage_id,
      deal_status_id: values.deal_status_id,
      amount: amountNum,
      account_id: values.account_id,
      owner_user_id: values.owner_user_id || null,
      contract_name: values.contract_name || null,
      application_date: values.application_date || null,
      review_completed_date: values.review_completed_date || null,
    };

    const result = await createDeal(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const newId = (result.data as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/deals/${newId}`);
    } else {
      router.push("/deals");
    }
    router.refresh();
  };

  return (
    <div style={styles.container}>
      <Link
        href="/deals"
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
        商談一覧に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>商談を新規作成</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={styles.grid}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>取引名 *</label>
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
              <label style={styles.label}>金額</label>
              <input
                type="number"
                min={0}
                style={styles.input}
                value={values.amount}
                onChange={(e) => set("amount", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約名</label>
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
              <label style={styles.label}>取引先 *</label>
              <select
                style={styles.input}
                value={values.account_id}
                onChange={(e) => set("account_id", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.accounts.map((o) => (
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
                <option value="">-- 未指定 --</option>
                {masters.owners.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* パイプライン */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>パイプライン</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>パイプライン *</label>
              <select
                style={styles.input}
                value={values.pipeline_type_id}
                onChange={(e) => handlePipelineChange(e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.pipelineTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div />
            <div>
              <label style={styles.label}>ステージ *</label>
              <select
                style={styles.input}
                value={values.deal_stage_id}
                onChange={(e) => set("deal_stage_id", e.target.value)}
                required
                disabled={!values.pipeline_type_id}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {filteredStages.map((o) => (
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
                value={values.deal_status_id}
                onChange={(e) => set("deal_status_id", e.target.value)}
                required
                disabled={!values.pipeline_type_id}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {filteredStatuses.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 日程 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>日程</h2>
          <div style={styles.grid}>
            <div>
              <label style={styles.label}>申請日</label>
              <input
                type="date"
                style={styles.input}
                value={values.application_date}
                onChange={(e) => set("application_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>審査完了日</label>
              <input
                type="date"
                style={styles.input}
                value={values.review_completed_date}
                onChange={(e) => set("review_completed_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.footer}>
          <Link
            href="/deals"
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

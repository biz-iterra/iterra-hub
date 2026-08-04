"use client";

import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createDeal } from "@/actions/deals";
import { useToast } from "@/components/ui/toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { isFieldValidationError } from "@/lib/errors";
import { calculateDefaultCloseDate } from "@/lib/deals/expected-close-date";
import { formContainerClass, fieldGridClass, formActionsClass } from "@/lib/layout";
import { RequiredMark } from "@/components/ui/RequiredMark";

type SelectOption = { value: string; label: string };
type PipelineOption = SelectOption & { default_close_months: number | null };
type StageOption = SelectOption & { pipeline_type_id: string };
type StatusOption = SelectOption & { pipeline_type_id: string };

type Masters = {
  pipelineTypes: PipelineOption[];
  dealStages: StageOption[];
  dealStatuses: StatusOption[];
  accounts: SelectOption[];
  companies: SelectOption[];
  contacts: SelectOption[];
  owners: SelectOption[];
};

/** 相手先の種別。取引先は契約成立まで存在しないため 3 択にする */
type CounterpartyKind = "account" | "company" | "contact";

const COUNTERPARTY_OPTIONS: { value: CounterpartyKind; label: string }[] = [
  { value: "company", label: "事業者情報" },
  { value: "contact", label: "連絡先" },
  { value: "account", label: "取引先" },
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
  helperText: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
    margin: "0.375rem 0 0 0",
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

export function DealNewForm({
  masters,
  initialAccountId = "",
  initialCompanyId = "",
  initialContactId = "",
  initialProjectId = "",
}: {
  masters: Masters;
  /** 各詳細から「商談を追加」で来たときの初期選択。いずれも固定はしない */
  initialAccountId?: string;
  initialCompanyId?: string;
  initialContactId?: string;
  /** プロジェクトから来たときの紐づけ先。作成後に deal_projects が張られる */
  initialProjectId?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    name: "",
    pipeline_type_id: "",
    deal_stage_id: "",
    deal_status_id: "",
    amount: "",
    account_id: initialAccountId,
    company_id: initialCompanyId,
    contact_id: initialContactId,
    owner_user_id: "",
    contract_name: "",
    application_date: "",
    review_completed_date: "",
    expected_close_date: "",
  });
  // 来歴から相手先の種別を決める。何も無ければ事業者情報（契約前が普通のため）
  const [counterpartyKind, setCounterpartyKind] = useState<CounterpartyKind>(
    initialAccountId ? "account" : initialContactId ? "contact" : "company"
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoCloseDateNote, setAutoCloseDateNote] = useState<string | null>(null);
  // クローズ予定日をユーザーが一度でも手で編集したら、以降はパイプライン変更で上書きしない
  const closeDateTouchedRef = useRef(false);

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
    // 一度でも手動編集していれば、クローズ予定日はパイプライン変更で上書きしない
    if (closeDateTouchedRef.current) {
      setValues((v) => ({
        ...v,
        pipeline_type_id: nextId,
        deal_stage_id: "",
        deal_status_id: "",
      }));
      return;
    }

    const pipeline = masters.pipelineTypes.find((p) => p.value === nextId);
    const months = pipeline?.default_close_months ?? null;
    const defaultDate = calculateDefaultCloseDate(new Date(), months);

    setValues((v) => ({
      ...v,
      pipeline_type_id: nextId,
      deal_stage_id: "",
      deal_status_id: "",
      expected_close_date: defaultDate ?? "",
    }));

    setAutoCloseDateNote(
      defaultDate && pipeline
        ? `${pipeline.label}パイプラインの既定（${months === 0 ? "0ヶ月後 = 今日" : `${months}ヶ月後`}）を設定しました。変更できます`
        : null
    );
  };

  const handleCloseDateChange = (value: string) => {
    closeDateTouchedRef.current = true;
    setAutoCloseDateNote(null);
    set("expected_close_date", value);
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
      // 選んだ種別のものだけ送る。DB の deals_counterparty_check は
      // account / company / contact のいずれか 1 つ以上を要求する
      account_id: counterpartyKind === "account" ? values.account_id || null : null,
      company_id: counterpartyKind === "company" ? values.company_id || null : null,
      contact_id: counterpartyKind === "contact" ? values.contact_id || null : null,
      // プロジェクトから来たときだけ渡す（deals の列ではなく deal_projects に張られる）
      project_id: initialProjectId || null,
      owner_user_id: values.owner_user_id || null,
      contract_name: values.contract_name || null,
      application_date: values.application_date || null,
      review_completed_date: values.review_completed_date || null,
      expected_close_date: values.expected_close_date || null,
    };

    const result = await createDeal(payload);
    setSaving(false);
    if (result.error) {
      if (isFieldValidationError(result.error)) {
        setError(result.error);
      } else {
        showToast({ type: "error", message: result.error });
      }
      return;
    }
    showToast({ type: "success", message: "商談を作成しました" });
    // router.push の直後に router.refresh() を呼ぶと、進行中のナビゲーションが
    // 現在ルートの再フェッチに差し替わって遷移が起きない。キャッシュの更新は
    // Server Action 側の revalidatePath に任せる（2026-08-03 修正）
    const newId = (result.data as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/deals/${newId}`);
    } else {
      router.push("/deals");
    }
  };

  return (
    <div className={styles.container}>
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
          <div className={styles.grid}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>取引名<RequiredMark /></label>
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
              <label style={styles.label}>相手先<RequiredMark /></label>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                {COUNTERPARTY_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="counterparty_kind"
                      value={o.value}
                      checked={counterpartyKind === o.value}
                      onChange={() => setCounterpartyKind(o.value)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {counterpartyKind === "account" && (
                <SearchableSelect
                  value={values.account_id}
                  onChange={(v) => set("account_id", v)}
                  options={masters.accounts}
                  nullable={false}
                  searchKind="account"
                  ariaLabel="取引先"
                />
              )}
              {counterpartyKind === "company" && (
                <SearchableSelect
                  value={values.company_id}
                  onChange={(v) => set("company_id", v)}
                  options={masters.companies}
                  nullable={false}
                  searchKind="company"
                  ariaLabel="事業者情報"
                />
              )}
              {counterpartyKind === "contact" && (
                <SearchableSelect
                  value={values.contact_id}
                  onChange={(v) => set("contact_id", v)}
                  options={masters.contacts}
                  nullable={false}
                  searchKind="contact"
                  ariaLabel="連絡先"
                />
              )}
              <p
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--color-sumi500)",
                  margin: "0.375rem 0 0 0",
                }}
              >
                取引先は契約が成立したときに作られます。契約前は事業者情報か連絡先を選んでください。
              </p>
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
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>パイプライン<RequiredMark /></label>
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
              <label style={styles.label}>ステージ<RequiredMark /></label>
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
              <label style={styles.label}>ステータス<RequiredMark /></label>
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
          <div className={styles.grid}>
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
            <div>
              <label style={styles.label}>クローズ予定日</label>
              <input
                type="date"
                style={styles.input}
                value={values.expected_close_date}
                onChange={(e) => handleCloseDateChange(e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              {autoCloseDateNote && (
                <p style={styles.helperText}>{autoCloseDateNote}</p>
              )}
            </div>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div className={formActionsClass}>
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

"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createDealWithLead } from "@/actions/deals";
import { useToast } from "@/components/ui/toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { isFieldValidationError } from "@/lib/errors";
import { calculateDefaultCloseDate } from "@/lib/deals/expected-close-date";
import { formContainerClass, fieldGridClass, formActionsClass } from "@/lib/layout";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { pipelineListPath } from "@/lib/deals/pipeline-screen";
import {
  DealLeadPicker,
  type DealLeadPickerValue,
} from "@/components/deals/DealLeadPicker";
import {
  defaultDealName,
  evaluateLeadForDeal,
  pickRaiseTargetStage,
  type LeadForDeal,
  type LeadStageForDeal,
} from "@/lib/deals/lead-requirement";

type SelectOption = { value: string; label: string };
type PipelineOption = SelectOption & {
  default_close_months: number | null;
  /** 作成後・キャンセル時に戻る一覧を決める（T-0073） */
  screen_key: string | null;
};
type StageOption = SelectOption & { pipeline_type_id: string };
type StatusOption = SelectOption & { pipeline_type_id: string };

type Masters = {
  pipelineTypes: PipelineOption[];
  dealStages: StageOption[];
  dealStatuses: StatusOption[];
  companies: SelectOption[];
  contacts: SelectOption[];
  owners: SelectOption[];
  /** リードのステージ全件。商談を作れる段階かの判定と、上げ先の決定に使う */
  leadStages: LeadStageForDeal[];
  accountTypes: SelectOption[];
  leadSources: SelectOption[];
};

/**
 * 相手先。**排他ではない。**
 *
 * 商談の相手は「Ａ社のＢさん」であることが普通なので、事業者情報と連絡先を
 * 同時に選べる（DB の `deals_counterparty_check` も「いずれか 1 つ以上」）。
 * **取引先は選ばせない**（2026-08-08。T-0070）。契約が成立したときに
 * 自動で作られるもので、商談を作る時点では存在しない。
 */
const COUNTERPARTY_FIELDS = [
  {
    key: "company_id",
    label: "事業者情報",
    searchKind: "company",
    optionsKey: "companies",
  },
  {
    key: "contact_id",
    label: "連絡先（先方の担当者）",
    searchKind: "contact",
    optionsKey: "contacts",
  },
] as const;

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
  initialCompanyId = "",
  initialContactId = "",
  initialProjectId = "",
  initialLeadId = "",
}: {
  masters: Masters;
  /** 各詳細から「商談を追加」で来たときの初期選択。いずれも固定はしない */
  initialCompanyId?: string;
  initialContactId?: string;
  /** プロジェクトから来たときの紐づけ先。作成後に deal_projects が張られる */
  initialProjectId?: string;
  /** リード詳細の「商談を追加」から来たとき */
  initialLeadId?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    name: "",
    pipeline_type_id: "",
    deal_stage_id: "",
    deal_status_id: "",
    amount: "",
    company_id: initialCompanyId,
    contact_id: initialContactId,
    owner_user_id: "",
    application_date: "",
    review_completed_date: "",
    expected_close_date: "",
  });

  // リード。商談はここから始まる（T-0070）
  const [leadValue, setLeadValue] = useState<DealLeadPickerValue>({
    mode: "existing",
    leadId: initialLeadId,
    newLead: {
      lead_name: "",
      account_type_id: "",
      lead_source_id: "",
      company_id: initialCompanyId,
      contact_id: initialContactId,
      company_name: "",
    },
    raiseStage: false,
  });
  const [selectedLead, setSelectedLead] = useState<LeadForDeal | null>(null);
  // 取引名を人が触ったら、リードを選び直しても上書きしない
  const dealNameTouchedRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoCloseDateNote, setAutoCloseDateNote] = useState<string | null>(null);
  // クローズ予定日をユーザーが一度でも手で編集したら、以降はパイプライン変更で上書きしない
  const closeDateTouchedRef = useRef(false);

  /**
   * リードが決まったら相手先と取引名を埋める。
   *
   * **固定はしない。** リードに事業者情報が無いことは珍しくないので
   * （手動作成のリードは 2026-08-08 まで設定手段が無かった）、
   * 埋めたうえで人が選び直せるようにする
   */
  const handleLeadResolved = useCallback((lead: LeadForDeal | null) => {
    setSelectedLead(lead);
    if (!lead) return;
    setValues((v) => ({
      ...v,
      company_id: lead.company?.id ?? v.company_id,
      contact_id: lead.contact?.id ?? v.contact_id,
      name: dealNameTouchedRef.current ? v.name : defaultDealName(lead.lead_name),
    }));
  }, []);

  const raiseTargetStage = pickRaiseTargetStage(masters.leadStages);

  // 選んだパイプラインの一覧へ戻る。未選択ならセールス
  const currentListPath = pipelineListPath(
    masters.pipelineTypes.find((p) => p.value === values.pipeline_type_id)?.screen_key
  );

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

    // リードは商談の起点。押す前に画面で弾く（DB のトリガーでも弾かれる）
    if (leadValue.mode === "existing") {
      if (!leadValue.leadId) {
        setSaving(false);
        setError("リードを選んでください");
        return;
      }
      const verdict = evaluateLeadForDeal(selectedLead);
      if (!verdict.ok && verdict.needsStageRaise && !leadValue.raiseStage) {
        setSaving(false);
        setError(
          `${verdict.message}「${raiseTargetStage?.name ?? "選定"}」へ進めて商談を作る、にチェックを入れてください。`
        );
        return;
      }
    } else {
      if (!leadValue.newLead.lead_name.trim()) {
        setSaving(false);
        setError("リード名を入力してください");
        return;
      }
      if (!leadValue.newLead.account_type_id) {
        setSaving(false);
        setError("事業者種別を選んでください");
        return;
      }
      if (!raiseTargetStage) {
        setSaving(false);
        setError("リードを作れるステージが見つかりません。マスタ管理を確認してください");
        return;
      }
    }

    // 相手先は入力箇所に紐づくのでインラインで返す（サーバー側の Zod でも弾く）
    if (!values.company_id && !values.contact_id) {
      setSaving(false);
      setError("相手先を選んでください（事業者情報・連絡先のいずれか。両方選べます）");
      return;
    }

    const payload = {
      lead_mode: leadValue.mode,
      lead_id: leadValue.mode === "existing" ? leadValue.leadId : null,
      new_lead:
        leadValue.mode === "new" && raiseTargetStage
          ? {
              lead_name: leadValue.newLead.lead_name,
              account_type_id: leadValue.newLead.account_type_id,
              // 新規のリードは商談を作れる段階（選定）から始める
              stage_id: raiseTargetStage.id,
              status_id: null,
              lead_source_id: leadValue.newLead.lead_source_id || null,
              company_id: leadValue.newLead.company_id || null,
              contact_id: leadValue.newLead.contact_id || null,
              company_name: leadValue.newLead.company_name || null,
              owner_user_id: values.owner_user_id || null,
            }
          : null,
      raise_stage_id:
        leadValue.mode === "existing" && leadValue.raiseStage && raiseTargetStage
          ? raiseTargetStage.id
          : null,
      raise_status_id: null,

      name: values.name,
      pipeline_type_id: values.pipeline_type_id,
      deal_stage_id: values.deal_stage_id,
      deal_status_id: values.deal_status_id,
      amount: amountNum,
      // 排他ではない。選んだものをそのまま送る
      // （DB の deals_counterparty_check はいずれか 1 つ以上を要求する）
      company_id: values.company_id || null,
      contact_id: values.contact_id || null,
      // プロジェクトから来たときだけ渡す（deals の列ではなく deal_projects に張られる）
      project_id: initialProjectId || null,
      owner_user_id: values.owner_user_id || null,
      application_date: values.application_date || null,
      review_completed_date: values.review_completed_date || null,
      expected_close_date: values.expected_close_date || null,
    };

    const result = await createDealWithLead(payload);
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
    const newId = result.data?.deal_id;
    if (newId) {
      router.push(`/deals/${newId}`);
    } else {
      router.push(currentListPath);
    }
  };

  return (
    <div className={styles.container}>
      <Link
        href={currentListPath}
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
        一覧に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>商談を新規作成</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* リード。商談はここから始まる（T-0070） */}
        <DealLeadPicker
          value={leadValue}
          onChange={setLeadValue}
          onLeadResolved={handleLeadResolved}
          leadStages={masters.leadStages}
          accountTypes={masters.accountTypes}
          leadSources={masters.leadSources}
          companies={masters.companies}
          contacts={masters.contacts}
        />

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
                onChange={(e) => {
                  dealNameTouchedRef.current = true;
                  set("name", e.target.value);
                }}
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
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>相手先<RequiredMark /></label>
              <p
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--color-sumi500)",
                  margin: "0 0 0.5rem 0",
                }}
              >
                リードを選ぶと自動で埋まります（選び直せます）。「Ａ社のＢさん」のように
                事業者情報と連絡先をいっしょに紐づけられます。
                <strong>取引先は契約が成立したときに自動で作られる</strong>ので、ここでは選びません。
              </p>
              <div className={styles.grid}>
                {COUNTERPARTY_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label style={{ ...styles.label, fontWeight: 500 }}>{f.label}</label>
                    <SearchableSelect
                      value={values[f.key]}
                      onChange={(v) => set(f.key, v)}
                      options={masters[f.optionsKey]}
                      emptyOptionLabel="-- 未選択 --"
                      searchKind={f.searchKind}
                      ariaLabel={f.label}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label style={styles.label}>担当者（社内）</label>
              <select
                style={styles.input}
                aria-label="担当者（社内）"
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

        {/*
          契約はここでは作れない。商談の ID が無いと `/contracts/new?deal_id=` を
          組み立てられないため。名前だけ打たせると契約テーブルと二重管理に
          なるので案内に留める（T-0063）
        */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>契約</h2>
          <p style={{ ...styles.helperText, margin: 0 }}>
            契約は商談を作成したあとに登録できます。作成後の編集画面から「契約を新規作成」するか、
            どの商談にも紐づいていない契約を紐づけてください。
          </p>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div className={formActionsClass}>
          <Link
            href={currentListPath}
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

"use client";

/**
 * 商談の新規作成でリードを決める部分（T-0070）。
 *
 * **セールスの商談には元になったリードが必要**（`pipeline_types.requires_lead`）。
 * 既存のリードを選ぶか、その場で作る。
 *
 * TQL 未満（`lead_stages.is_deal_ready` が偽）のリードは**選ばせないのではなく、
 * その場で選定へ上げる**。選べなくすると、リード一覧へ戻って直して
 * また商談の入力をやり直すことになる。ただし黙って上げるのは論外なので、
 * チェックボックスで明示的に同意させる。
 *
 * リードの新規作成も**この画面の中で**行う。`/leads/new` へ飛ばすと
 * 入力中の商談が消える。
 *
 * Phase 2 で `/sales` へ移すため、フォーム本体から切り出してある。
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, UserSearch } from "lucide-react";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { getLeadForDealCreation } from "@/actions/deals";
import {
  evaluateLeadForDeal,
  pickRaiseTargetStage,
  type LeadForDeal,
  type LeadStageForDeal,
} from "@/lib/deals/lead-requirement";
import { fieldGridClass } from "@/lib/layout";

export type LeadMode = "existing" | "new";

export type NewLeadDraft = {
  lead_name: string;
  account_type_id: string;
  lead_source_id: string;
  company_id: string;
  contact_id: string;
  company_name: string;
};

export type SelectOption = { value: string; label: string };

export type DealLeadPickerValue = {
  mode: LeadMode;
  leadId: string;
  newLead: NewLeadDraft;
  /** TQL 未満のリードを上げることに同意したか */
  raiseStage: boolean;
};

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 0.5rem 0",
  } as CSSProperties,
  lead: {
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    margin: "0 0 1rem 0",
  } as CSSProperties,
  modeRow: {
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap",
    marginBottom: "1rem",
  } as CSSProperties,
  modeLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.875rem",
    cursor: "pointer",
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
  summary: {
    marginTop: "0.75rem",
    padding: "0.75rem 1rem",
    borderRadius: "var(--radius-sm)",
    backgroundColor: "var(--color-bg-subtle, #f7f7f8)",
    fontSize: "0.8125rem",
    color: "var(--color-text-body)",
  } as CSSProperties,
  summaryRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.25rem",
  } as CSSProperties,
  summaryKey: {
    color: "var(--color-sumi600)",
    minWidth: "6rem",
  } as CSSProperties,
  warning: {
    marginTop: "0.75rem",
    padding: "0.75rem 1rem",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-warning, #e0a34a)",
    backgroundColor: "var(--color-warning-bg, rgba(224, 163, 74, 0.08))",
    fontSize: "0.8125rem",
    color: "var(--color-text-body)",
  } as CSSProperties,
  warningHead: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    fontWeight: 600,
    marginBottom: "0.375rem",
  } as CSSProperties,
  consentRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: "0.5rem",
    cursor: "pointer",
  } as CSSProperties,
  helperText: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
    margin: "0.375rem 0 0 0",
  } as CSSProperties,
};

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

export function DealLeadPicker({
  value,
  onChange,
  onLeadResolved,
  leadStages,
  accountTypes,
  leadSources,
  companies,
  contacts,
}: {
  value: DealLeadPickerValue;
  onChange: (next: DealLeadPickerValue) => void;
  /**
   * 選んだリードが確定したときに呼ぶ。相手先（事業者情報・連絡先）と
   * 取引名の既定値をフォーム側へ渡す
   */
  onLeadResolved: (lead: LeadForDeal | null) => void;
  /** リードのステージ全件。上げ先の判定に使う */
  leadStages: readonly LeadStageForDeal[];
  accountTypes: readonly SelectOption[];
  leadSources: readonly SelectOption[];
  companies: readonly SelectOption[];
  contacts: readonly SelectOption[];
}) {
  const [selectedLead, setSelectedLead] = useState<LeadForDeal | null>(null);
  const [loading, setLoading] = useState(false);
  const raiseTarget = pickRaiseTargetStage(leadStages);
  const verdict = evaluateLeadForDeal(selectedLead);

  // 選んだリードの中身を引く（相手先の自動補完と、段階の判定に使う）
  const requestSeq = useRef(0);
  const fetchLead = useCallback(
    async (leadId: string) => {
      const seq = ++requestSeq.current;
      if (!leadId) {
        setSelectedLead(null);
        onLeadResolved(null);
        return;
      }
      setLoading(true);
      const { data } = await getLeadForDealCreation(leadId);
      // 打ち直しで古い応答が後から届くことがある
      if (seq !== requestSeq.current) return;
      setLoading(false);
      setSelectedLead(data);
      onLeadResolved(data);
    },
    [onLeadResolved]
  );

  useEffect(() => {
    if (value.mode !== "existing") {
      setSelectedLead(null);
      return;
    }
    void fetchLead(value.leadId);
    // value.leadId が変わったときだけ引き直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.mode, value.leadId]);

  const setMode = (mode: LeadMode) => {
    onChange({ ...value, mode, raiseStage: false });
    if (mode === "new") onLeadResolved(null);
  };

  const setNewLead = <K extends keyof NewLeadDraft>(key: K, v: NewLeadDraft[K]) => {
    onChange({ ...value, newLead: { ...value.newLead, [key]: v } });
  };

  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>
        <UserSearch size={16} />
        リード<RequiredMark />
      </h2>
      <p style={styles.lead}>
        商談は<strong>リードから始めます</strong>。既にあるリードを選ぶか、ここで新しく作ってください。
      </p>

      <div style={styles.modeRow} role="radiogroup" aria-label="リードの選び方">
        <label style={styles.modeLabel}>
          <input
            type="radio"
            name="lead_mode"
            checked={value.mode === "existing"}
            onChange={() => setMode("existing")}
          />
          既存のリードから選ぶ
        </label>
        <label style={styles.modeLabel}>
          <input
            type="radio"
            name="lead_mode"
            checked={value.mode === "new"}
            onChange={() => setMode("new")}
          />
          リードを新規作成する
        </label>
      </div>

      {value.mode === "existing" ? (
        <div>
          <label style={styles.label}>リード<RequiredMark /></label>
          <SearchableSelect
            value={value.leadId}
            onChange={(v) => onChange({ ...value, leadId: v, raiseStage: false })}
            options={[]}
            emptyOptionLabel="-- 未選択 --"
            searchKind="lead"
            ariaLabel="リード"
            placeholder="リード名・企業名で絞り込み"
          />

          {loading && <p style={styles.helperText}>読み込み中...</p>}

          {selectedLead && (
            <div style={styles.summary}>
              <div style={styles.summaryRow}>
                <span style={styles.summaryKey}>リード名</span>
                <span>{selectedLead.lead_name}</span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryKey}>ステージ</span>
                <span>{selectedLead.stage?.name ?? "—"}</span>
              </div>
              <div style={styles.summaryRow}>
                <span style={styles.summaryKey}>事業者情報</span>
                <span>{selectedLead.company?.name ?? "—"}</span>
              </div>
              <div style={{ ...styles.summaryRow, marginBottom: 0 }}>
                <span style={styles.summaryKey}>連絡先</span>
                <span>{selectedLead.contact?.label ?? "—"}</span>
              </div>
            </div>
          )}

          {/* TQL 未満。選ばせないのではなく、その場で上げられるようにする */}
          {!verdict.ok && verdict.needsStageRaise && raiseTarget && (
            <div style={styles.warning}>
              <div style={styles.warningHead}>
                <AlertTriangle size={14} />
                このリードはまだ商談を作れる段階ではありません
              </div>
              <div>{verdict.message}</div>
              <label style={styles.consentRow}>
                <input
                  type="checkbox"
                  checked={value.raiseStage}
                  onChange={(e) => onChange({ ...value, raiseStage: e.target.checked })}
                />
                <span>
                  「{raiseTarget.name}」へ進めて商談を作る
                </span>
              </label>
            </div>
          )}
        </div>
      ) : (
        <div className={fieldGridClass}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={styles.label}>リード名<RequiredMark /></label>
            <input
              type="text"
              style={styles.input}
              value={value.newLead.lead_name}
              onChange={(e) => setNewLead("lead_name", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
            <p style={styles.helperText}>
              ステージは「{raiseTarget?.name ?? "選定"}」で作成されます。
            </p>
          </div>
          <div>
            <label style={styles.label}>事業者種別<RequiredMark /></label>
            <select
              style={styles.input}
              aria-label="事業者種別"
              value={value.newLead.account_type_id}
              onChange={(e) => setNewLead("account_type_id", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 選択 --</option>
              {accountTypes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={styles.label}>流入元</label>
            <select
              style={styles.input}
              aria-label="流入元"
              value={value.newLead.lead_source_id}
              onChange={(e) => setNewLead("lead_source_id", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 未選択 --</option>
              {leadSources.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={styles.label}>事業者情報</label>
            <SearchableSelect
              value={value.newLead.company_id}
              onChange={(v) => setNewLead("company_id", v)}
              options={companies}
              emptyOptionLabel="-- 未選択 --"
              searchKind="company"
              ariaLabel="リードの事業者情報"
            />
          </div>
          <div>
            <label style={styles.label}>連絡先</label>
            <SearchableSelect
              value={value.newLead.contact_id}
              onChange={(v) => setNewLead("contact_id", v)}
              options={contacts}
              emptyOptionLabel="-- 未選択 --"
              searchKind="contact"
              ariaLabel="リードの連絡先"
            />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={styles.label}>会社名</label>
            <input
              type="text"
              style={styles.input}
              value={value.newLead.company_name}
              onChange={(e) => setNewLead("company_name", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
            <p style={styles.helperText}>
              事業者情報にまだ無い相手はこちらに書きます。登録済みなら上の「事業者情報」で選んでください。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

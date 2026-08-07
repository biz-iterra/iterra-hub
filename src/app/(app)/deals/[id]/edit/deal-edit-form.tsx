"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { updateDeal, deleteDeal } from "@/actions/deals";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerClass, fieldGridClass, formFooterClass } from "@/lib/layout";
import { RequiredMark } from "@/components/ui/RequiredMark";
import {
  DealContractsSection,
  type DealContractRow,
} from "@/components/deals/DealContractsSection";

type SelectOption = { value: string; label: string };
type StageOption = SelectOption & { pipeline_type_id: string };
type StatusOption = SelectOption & { pipeline_type_id: string };

type DealData = {
  id: string;
  name: string;
  pipeline_type_id: string;
  deal_stage_id: string;
  deal_status_id: string;
  amount: number | null;
  application_date: string | null;
  review_completed_date: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  /** 楽観ロック用。編集開始時点の値をそのまま保存時に送り返す */
  updated_at?: string | null;
};

type Masters = {
  pipelineTypes: SelectOption[];
  dealStages: StageOption[];
  dealStatuses: StatusOption[];
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

export function DealEditForm({
  deal,
  masters,
  isAdmin,
  contracts,
  canManageContracts,
}: {
  deal: DealData;
  masters: Masters;
  isAdmin: boolean;
  /** この商談に紐づいている契約。表示と紐づけ操作は下部のセクションが持つ */
  contracts: DealContractRow[];
  /** contracts の書き込みは manager 以上に限る（RLS と同じ条件） */
  canManageContracts: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    name: deal.name ?? "",
    pipeline_type_id: deal.pipeline_type_id ?? "",
    deal_stage_id: deal.deal_stage_id ?? "",
    deal_status_id: deal.deal_status_id ?? "",
    amount: deal.amount != null ? String(deal.amount) : "",
    application_date: deal.application_date ?? "",
    review_completed_date: deal.review_completed_date ?? "",
    expected_close_date: deal.expected_close_date ?? "",
    closed_at: deal.closed_at ? deal.closed_at.slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    const result = await deleteDeal(deal.id);
    if (result.error) {
      return { error: result.error };
    }
    showToast({ type: "success", message: "商談を削除しました" });
    // router.refresh() は呼ばない（push が中断され遷移しなくなる）。
    // キャッシュ更新は Server Action 側の revalidatePath に任せる
    router.push("/deals");
    return { error: null };
  };

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
    setValues((v) => {
      const stageStillValid = masters.dealStages.some(
        (s) => s.value === v.deal_stage_id && s.pipeline_type_id === nextId
      );
      const statusStillValid = masters.dealStatuses.some(
        (s) => s.value === v.deal_status_id && s.pipeline_type_id === nextId
      );
      return {
        ...v,
        pipeline_type_id: nextId,
        deal_stage_id: stageStillValid ? v.deal_stage_id : "",
        deal_status_id: statusStillValid ? v.deal_status_id : "",
      };
    });
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
      application_date: values.application_date || null,
      review_completed_date: values.review_completed_date || null,
      expected_close_date: values.expected_close_date || null,
      closed_at: values.closed_at
        ? new Date(values.closed_at).toISOString()
        : null,
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: deal.updated_at ?? undefined,
    };

    const result = await updateDeal(deal.id, payload);
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
    router.push(`/deals/${deal.id}`);
  };

  return (
    <div className={styles.container}>
      <Link
        href={`/deals/${deal.id}`}
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
        商談詳細に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>商談を編集</h1>
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
            {/*
              取引先・担当者は別レコードへの紐づけなので詳細ページで直す。
              契約も同じ理由でフォームの外（このページ下部の契約セクション）に置く。
              以前ここにあった「契約名」は deals.contract_name というテキスト列で、
              contracts テーブルと二重管理になっていたため外した（T-0063）
            */}
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
                onChange={(e) => set("expected_close_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>クローズ日</label>
              <input
                type="date"
                style={styles.input}
                value={values.closed_at}
                onChange={(e) => set("closed_at", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/*
          契約セクション。**フォームの中に置く**（T-0066）。
          以前は `</form>` の外にあり、削除・保存ボタンのすぐ下に接して見えた。
          中のボタンはすべて `type="button"` なので submit されない。
          「保存を押さずに反映される」ことはセクション側の見た目で示す
        */}
        <DealContractsSection
          dealId={deal.id}
          contracts={contracts}
          canManage={canManageContracts}
        />

        {error && <p style={styles.error}>{error}</p>}

        <div className={formFooterClass}>
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
              href={`/deals/${deal.id}`}
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
        title="商談を削除"
        message={`「${deal.name}」を削除します。紐づく契約が存在する場合は削除できません。復元はシステム管理者に依頼してください。`}
        confirmLabel="削除する"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

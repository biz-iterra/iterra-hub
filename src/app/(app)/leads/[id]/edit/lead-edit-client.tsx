"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
} from "lucide-react";
import { updateLead, deleteLead } from "@/actions/leads";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";
import type { LeadDetail } from "@/types/relations";
import { formActionsClass, formContainerClass, fieldGridClass, fieldGrid3Class } from "@/lib/layout";

type SelectOption = { value: string; label: string };
type StatusOption = SelectOption & { stage_id: string };
type SmallSegmentOption = SelectOption & { large_segment_id: string | null };
type StageOption = SelectOption & { auto_promote_to_deal?: boolean };
type TempOption = SelectOption & { code: string | null };
type AccountTypeOption = SelectOption & { requiresCorporateFields?: boolean; isCompanyDefault?: boolean };

type Masters = {
  stages: StageOption[];
  statuses: StatusOption[];
  temperatures: TempOption[];
  sources: SelectOption[];
  accountTypes: AccountTypeOption[];
  callStatuses: SelectOption[];
  largeSegments: SelectOption[];
  smallSegments: SmallSegmentOption[];
  owners: SelectOption[];
  categories: SelectOption[];
};

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
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
  helpText: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    marginTop: "0.25rem",
  } as CSSProperties,
  grid2: fieldGridClass,
  grid3: fieldGrid3Class,
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
    padding: "0.5rem 1rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
  } as CSSProperties,
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "transparent",
    color: "var(--color-error)",
    border: "1px solid var(--color-error)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
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
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) {
  e.currentTarget.style.boxShadow = "";
}

export function LeadEditClient({
  lead,
  masters,
}: {
  lead: LeadDetail;
  masters: Masters;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  // 昇格済みフラグ（いずれかの promoted_* が存在する）
  const isPromoted = !!(
    lead.promoted_deal_id ??
    lead.promoted_company_id ??
    lead.promoted_contact_id ??
    lead.promoted_account_id
  );

  // ---- フォーム状態 ----
  // 初期化時: company_name 有 + account_type_id 空 + 未昇格 → 法人を自動設定
  const getInitialAccountTypeId = (): string => {
    if (lead.account_type_id) return lead.account_type_id;
    if (lead.company_name && !isPromoted) {
      // 既定の種別はマスタが持つ（スラッグで決め打たない。20260805000018）
      const corporateType = masters.accountTypes.find((t) => t.isCompanyDefault);
      if (corporateType) return corporateType.value;
    }
    return "";
  };

  const [values, setValues] = useState({
    lead_name: lead.lead_name ?? "",
    // 進捗セクション
    stage_id: lead.stage_id ?? "",
    status_id: lead.status_id ?? "",
    // リード属性セクション
    large_segment_id: lead.large_segment_id ?? "",
    small_segment_id: lead.small_segment_id ?? "",
    lead_source_id: lead.lead_source_id ?? "",
    account_type_id: getInitialAccountTypeId(),
  });

  // デマンドファネルは導出値。現在値だけを見せる
  const currentCategoryLabel =
    masters.categories.find((c) => c.value === lead.category_id)?.label ?? "未設定";

  const [saving, setSaving] = useState(false);
  // フィールド単位のエラー（従業員数・資本金の形式不正などの事前検証、
  // および Server Action が返す Zod / マスタ由来のフィールドエラー）はインラインのまま
  const [saveError, setSaveError] = useState<string | null>(null);
  // 法人番号重複の警告（保存はブロックしない）。入力値に紐づく警告のためインラインのまま
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [saveWarningDismissed, setSaveWarningDismissed] = useState(false);
  const [promotedDealId, setPromotedDealId] = useState<string | null>(
    lead.promoted_deal_id ?? null
  );

  // ---- 削除確認ダイアログ ----
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  // ---- Opportunity 昇格確認ダイアログ ----
  const [promoteConfirmOpen, setPromoteConfirmOpen] = useState(false);

  const set = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K]
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const filteredStatuses = useMemo(
    () =>
      values.stage_id
        ? masters.statuses.filter((s) => s.stage_id === values.stage_id)
        : masters.statuses,
    [masters.statuses, values.stage_id]
  );

  // **ステータス欄を出すかは「そのステージにステータスが定義されているか」で決める。**
  // 特定のステージを名指しで決め打つと、ステータスを持つ昇格ステージ（Sales）で
  // 欄が消える。規則はマスタが持つ（docs/database-design.md §24.5）
  const stageHasStatuses = useMemo(
    () =>
      values.stage_id
        ? masters.statuses.some((s) => s.stage_id === values.stage_id)
        : true,
    [masters.statuses, values.stage_id]
  );

  /** 選択中のステージ名。昇格ダイアログの見出しに使う */
  const selectedStageName = useMemo(
    () => masters.stages.find((s) => s.value === values.stage_id)?.label ?? "ディール",
    [masters.stages, values.stage_id]
  );

  // 保存するとディールが自動生成されるステージか（昇格の予告に使う）
  const isPromoteStage = useMemo(
    () =>
      values.stage_id
        ? masters.stages.some(
            (s) => s.value === values.stage_id && s.auto_promote_to_deal === true
          )
        : false,
    [masters.stages, values.stage_id]
  );

  const filteredSmallSegments = useMemo(
    () =>
      values.large_segment_id
        ? masters.smallSegments.filter(
            (s) => s.large_segment_id === values.large_segment_id
          )
        : masters.smallSegments,
    [masters.smallSegments, values.large_segment_id]
  );

  const handleStageChange = (nextId: string) => {
    setValues((v) => ({ ...v, stage_id: nextId, status_id: "" }));
  };


  // Opportunity 昇格確認モーダルを表示すべきか
  // （既に promoted_deal_id がある場合はモーダル不要）
  const needsPromoteConfirm = useMemo(() => {
    if (promotedDealId) return false;
    return isPromoteStage && values.stage_id !== (lead.stage_id ?? "");
  }, [isPromoteStage, values.stage_id, lead.stage_id, promotedDealId]);

  // 昇格する事業者種別を判定（法人か個人か）
  const isCorporateSelected = useMemo(() => {
    const selected = masters.accountTypes.find((t) => t.value === values.account_type_id);
    // 法人向けの入力欄を出すかは**マスタの設定**で決まる（20260805000018）
    return selected?.requiresCorporateFields === true;
  }, [masters.accountTypes, values.account_type_id]);

  // 保存ボタンの disabled 判定:
  // ステータスを持つステージで未選択の場合はサーバー側でエラーになるため先制制御
  const isSaveDisabled =
    saving || (stageHasStatuses && !!values.stage_id && !values.status_id);


  // 保存処理の本体（昇格確認後または昇格不要時に呼ばれる）
  // isPromotionFlow: true の場合、Server Action のエラーは Opportunity 昇格確認ダイアログ内に
  // インライン表示するためトーストにしない（確認ダイアログ内のエラー表示は仕様上インライン）
  const executeSave = async (
    opts: { isPromotionFlow?: boolean } = {}
  ): Promise<{ redirectTo: string | null; error: string | null }> => {
    setSaving(true);
    setSaveError(null);
    setSaveWarning(null);

    const payload = {
      id: lead.id,
      lead_name: values.lead_name,
      account_type_id: values.account_type_id || undefined,
      stage_id: values.stage_id || undefined,
      status_id: values.status_id || null,
      lead_source_id: values.lead_source_id || null,
      large_segment_id: values.large_segment_id || null,
      small_segment_id: values.small_segment_id || null,
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: lead.updated_at ?? undefined,
    };

    const result = await updateLead(payload);
    setSaving(false);

    if (!result.ok) {
      const firstError = Object.values(result.errors).flat()[0] ?? "保存に失敗しました";
      if (opts.isPromotionFlow) {
        // 昇格確認ダイアログ内でインライン表示するため呼び出し元に返すのみ（トーストにしない）
        return { redirectTo: null, error: firstError };
      }
      // フィールドエラー（Zod / マスタ未投入等）はインライン表示、
      // 権限エラー・楽観ロック競合・DB エラー等はトーストで通知
      if (isFieldValidationError(firstError)) {
        setSaveError(firstError);
      } else {
        showToast({ type: "error", message: firstError });
      }
      return { redirectTo: null, error: firstError };
    }

    // warnings（法人番号重複など）は入力値に紐づく警告のためインライン表示
    if (result.warnings && result.warnings.length > 0) {
      setSaveWarning(result.warnings[0]);
      setSaveWarningDismissed(false);
    }

    const updatedLead = result.lead;
    const justPromoted =
      !!updatedLead?.promoted_deal_id && updatedLead.promoted_deal_id !== promotedDealId;
    if (justPromoted) {
      setPromotedDealId(updatedLead!.promoted_deal_id!);
      showToast({
        type: "success",
        message: isCorporateSelected
          ? "ディールに昇格しました。事業者情報と連絡先も作成されました"
          : "ディールに昇格しました。連絡先も作成されました",
      });
    } else {
      showToast({ type: "success", message: "保存しました" });
    }

    // warnings がある場合はページ遷移しない（ユーザーに認識させる）
    if (result.warnings && result.warnings.length > 0) {
      return { redirectTo: null, error: null };
    }

    // 保存成功 → 詳細ページへ戻る
    return { redirectTo: `/leads/${lead.id}`, error: null };
  };

  // 保存ボタン押下: Opportunity 昇格が必要ならモーダル表示、それ以外は即保存
  const handleSave = async () => {
    if (needsPromoteConfirm) {
      setPromoteConfirmOpen(true);
    } else {
      const result = await executeSave();
      if (result.redirectTo) {
        router.replace(result.redirectTo);
      }
    }
  };

  // 昇格確認モーダルの onConfirm（エラーはモーダル内にインライン表示）
  const handlePromoteConfirm = async (): Promise<{ error: string | null }> => {
    const result = await executeSave({ isPromotionFlow: true });
    if (result.error) {
      return { error: result.error };
    }
    if (result.redirectTo) {
      setPromoteConfirmOpen(false);
      setTimeout(() => {
        router.replace(result.redirectTo!);
      }, 0);
    }
    return { error: null };
  };

  const handleDelete = (): Promise<{ error: string | null }> => {
    return new Promise((resolve) => {
      startDeleteTransition(async () => {
        const result = await deleteLead(lead.id);
        if (result.error) {
          // 削除確認ダイアログ内にインライン表示
          resolve({ error: result.error });
          return;
        }
        showToast({ type: "success", message: "リードを削除しました" });
        router.push("/leads");
        resolve({ error: null });
      });
    });
  };

  return (
    <div className={formContainerClass}>
      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        open={deleteOpen}
        title="リードを削除しますか？"
        message="このリードを削除します。削除後は管理者のみ復元できます（論理削除）。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />

      {/* ディール昇格の確認ダイアログ */}
      <PromoteConfirmDialog
        open={promoteConfirmOpen}
        stageName={selectedStageName}
        isCorporate={isCorporateSelected}
        onConfirm={handlePromoteConfirm}
        onClose={() => setPromoteConfirmOpen(false)}
      />

      {/* Back */}
      <Link
        href={`/leads/${lead.id}`}
        className="hover:bg-[var(--color-bg-hover)]"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          color: "var(--color-sumi600)",
          fontSize: "0.875rem",
          textDecoration: "none",
          marginBottom: "0.75rem",
          padding: "0.125rem 0.375rem",
          borderRadius: "var(--radius-sm)",
        }}
      >
        <ArrowLeft size={16} />
        詳細に戻る
      </Link>

      {/* Header */}
      <div
        className="flex items-center justify-between mb-4 flex-wrap gap-3"
      >
        <h1
          style={{
            color: "var(--color-text-title)",
            fontSize: "1.5rem",
            fontWeight: 700,
            margin: 0,
          }}
        >
          {lead.lead_name} — 編集
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* 削除ボタン */}
          <button
            type="button"
            style={{
              ...styles.btnDanger,
              ...(isDeleting ? { opacity: 0.6, cursor: "not-allowed" } : {}),
            }}
            onClick={() => !isDeleting && setDeleteOpen(true)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                削除中...
              </>
            ) : (
              <>
                <Trash2 size={14} />
                削除
              </>
            )}
          </button>

          {/* キャンセル */}
          <Link
            href={`/leads/${lead.id}`}
            style={styles.btnOutline}
          >
            キャンセル
          </Link>

          {/* 保存 */}
          <button
            type="button"
            style={styles.btnPrimary}
            onClick={handleSave}
            disabled={isSaveDisabled}
          >
            <Save size={14} />
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* 法人番号重複など warnings バナー */}
      {saveWarning && !saveWarningDismissed && (
        <div
          style={{
            backgroundColor: "rgba(229,196,127,0.2)",
            border: "1px solid var(--color-amber)",
            borderRadius: "var(--radius-card)",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            color: "#8A6D1E",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.5rem",
          }}
        >
          <span style={{ flex: 1 }}>
            <strong>保存しましたが、確認が必要な項目があります:</strong>{" "}
            {saveWarning}
          </span>
          <button
            type="button"
            onClick={() => setSaveWarningDismissed(true)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#8A6D1E",
              fontSize: "1rem",
              lineHeight: 1,
              padding: "0.125rem",
              flexShrink: 0,
            }}
            aria-label="閉じる"
          >
            ×
          </button>
        </div>
      )}
      {saveError && <p style={styles.error}>{saveError}</p>}

      {/* リード名（全セクション共通） */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          リード名
        </h2>
        <div>
          <label style={styles.label}>リード名 *</label>
          <input
            type="text"
            style={styles.input}
            value={values.lead_name}
            onChange={(e) => set("lead_name", e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
          />
        </div>
      </div>

      {/* ① 進捗セクション（ステージ / ステータス / カテゴリ / 温度感） */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          進捗
        </h2>
        <div className={styles.grid2} style={{ marginBottom: "1rem" }}>
          <div>
            <label style={styles.label}>ステージ</label>
            <select
              style={styles.input}
              value={values.stage_id}
              onChange={(e) => handleStageChange(e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 選択 --</option>
              {masters.stages.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p style={styles.helpText}>
              「Opportunity」ステージに変更して保存するとディール昇格が試みられます
            </p>
          </div>
          <div>
            <label style={styles.label}>ステータス</label>
            {!stageHasStatuses ? (
              <div
                style={{
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-input)",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "var(--color-sumi50)",
                  color: "var(--color-sumi500)",
                  fontSize: "0.875rem",
                }}
              >
                —
              </div>
            ) : (
              <select
                style={styles.input}
                value={values.status_id}
                onChange={(e) => set("status_id", e.target.value)}
                disabled={!values.stage_id}
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
            )}
            {!stageHasStatuses && (
              <p style={{ ...styles.helpText, color: "var(--color-terra)" }}>
                このステージではディールが自動生成されます
              </p>
            )}
            {stageHasStatuses && values.stage_id && !values.status_id && (
              <p style={{ ...styles.helpText, color: "var(--color-error)" }}>
                ステータスを選択してください
              </p>
            )}
          </div>
        </div>
        {/*
          デマンドファネルは**選ばせない**（2026-08-08。T-0077）。
          トリガー trg_leads_set_category がステージと流入元から毎回上書きする
          完全な導出値で、選んでも反映されなかった
        */}
        <div style={{ maxWidth: 320 }}>
          <label style={styles.label}>デマンドファネル</label>
          <p style={{ ...styles.helpText, marginTop: 0 }}>
            現在: {currentCategoryLabel}
          </p>
          <p style={styles.helpText}>
            ステージと流入元から自動で決まります。直接は選べません。
          </p>
        </div>
      </div>

      {/*
        企業情報と担当者情報はここから外した。ほとんどのリードは名寄せで
        事業者情報・連絡先に紐づいており（3,812 件中 3,771 件）、両方で直せると
        どちらが正しいのか分からなくなる。**会社や人の情報はそれぞれの詳細ページで直す。**
        リードが持つのは取り込んだ時点の記録で、詳細ページに読み取りとして残る。
      */}

      {/* ④ リード属性セクション */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          リード属性
        </h2>
        <div className={styles.grid3} style={{ marginBottom: "1rem" }}>
          <div>
            <label style={styles.label}>大分類セグメント</label>
            <select
              style={styles.input}
              value={values.large_segment_id}
              onChange={(e) => {
                set("large_segment_id", e.target.value);
                set("small_segment_id", "");
              }}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 未選択 --</option>
              {masters.largeSegments.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={styles.label}>小分類セグメント</label>
            <select
              style={styles.input}
              value={values.small_segment_id}
              onChange={(e) => set("small_segment_id", e.target.value)}
              disabled={!values.large_segment_id}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 未選択 --</option>
              {filteredSmallSegments.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
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
              <option value="">-- 未選択 --</option>
              {masters.sources.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.grid3} style={{ marginBottom: "1rem" }}>
          <div>
            <label style={styles.label}>事業者種別</label>
            <select
              style={{
                ...styles.input,
                ...(isPromoted ? { backgroundColor: "var(--color-sumi50)", color: "var(--color-sumi500)", cursor: "not-allowed" } : {}),
              }}
              value={values.account_type_id}
              onChange={(e) => set("account_type_id", e.target.value)}
              disabled={isPromoted}
              onFocus={isPromoted ? undefined : onFocus}
              onBlur={isPromoted ? undefined : onBlur}
            >
              <option value="">-- 選択 --</option>
              {masters.accountTypes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {isPromoted && (
              <p style={{ ...styles.helpText, color: "var(--color-sumi500)" }}>
                昇格後は事業者情報/連絡先に紐付けられているため変更できません
              </p>
            )}
          </div>
          {/* 社内担当者（主・副）は別レコードへの紐づけなので詳細ページで直す */}
        </div>
      </div>

      {/* ページ下部にも保存・キャンセルボタン */}
      <div className={formActionsClass} style={{ marginTop: "0.5rem" }}>
        <Link href={`/leads/${lead.id}`} style={styles.btnOutline}>
          キャンセル
        </Link>
        <button
          type="button"
          style={styles.btnPrimary}
          onClick={handleSave}
          disabled={saving}
        >
          <Save size={14} />
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}

// ---- ディール昇格の確認ダイアログ ----
// Sales / Opportunity のどちらでも出る（auto_promote_to_deal なステージが対象）
function PromoteConfirmDialog({
  open,
  stageName,
  isCorporate,
  onConfirm,
  onClose,
}: {
  open: boolean;
  /** 遷移先のステージ名。Opportunity 固定で書かない */
  stageName: string;
  isCorporate: boolean;
  onConfirm: () => Promise<{ error: string | null }>;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    const result = await onConfirm();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
  };

  const overlayStyle: CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "var(--color-overlay)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  };
  const modalStyle: CSSProperties = {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-modal)",
    boxShadow: "var(--elevation-overlay)",
    maxWidth: 480,
    width: "100%",
    padding: "1.5rem",
  };
  const titleStyle: CSSProperties = {
    color: "var(--color-text-title)",
    fontSize: "1.125rem",
    fontWeight: 600,
    margin: "0 0 0.75rem 0",
  };
  const bodyStyle: CSSProperties = {
    color: "var(--color-text-body)",
    fontSize: "0.875rem",
    lineHeight: 1.7,
    margin: "0 0 1.25rem 0",
  };
  const listStyle: CSSProperties = {
    margin: "0.5rem 0 0.5rem 1.25rem",
    padding: 0,
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
  };
  const btnOutlineStyle: CSSProperties = {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
  };
  const btnPrimaryStyle: CSSProperties = {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: 500,
  };

  return (
    <div style={overlayStyle} onClick={loading ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h2 style={titleStyle}>{stageName} に昇格します</h2>
        <div style={bodyStyle}>
          <p style={{ margin: "0 0 0.5rem 0" }}>
            この操作により、以下が自動生成されます:
          </p>
          {isCorporate ? (
            <ul style={listStyle}>
              <li>事業者情報</li>
              <li>連絡先</li>
              <li>ディール</li>
            </ul>
          ) : (
            <ul style={listStyle}>
              <li>連絡先</li>
              <li>ディール</li>
            </ul>
          )}
          <p style={{ margin: "0.5rem 0 0 0", color: "var(--color-sumi500)" }}>
            取引先は契約が成立したときに作られます（ここでは作られません）。
          </p>
          <p style={{ margin: "0.5rem 0 0 0" }}>
            生成された後に自動で削除することはできません。続けますか？
          </p>
        </div>
        {error && (
          <p style={{ color: "var(--color-error)", fontSize: "0.875rem", margin: "0 0 0.75rem 0" }}>
            {error}
          </p>
        )}
        <div className={formActionsClass}>
          <button type="button" style={btnOutlineStyle} onClick={onClose} disabled={loading}>
            キャンセル
          </button>
          <button type="button" style={btnPrimaryStyle} onClick={handleConfirm} disabled={loading}>
            {loading ? "処理中..." : "昇格する"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Trash2,
  Thermometer,
  ArrowUpRight,
  Loader2,
} from "lucide-react";
import { updateLead, deleteLead } from "@/actions/leads";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type SelectOption = { value: string; label: string };
type StatusOption = SelectOption & { stage_id: string };
type SmallSegmentOption = SelectOption & { large_segment_id: string | null };
type StageOption = SelectOption & { slug?: string };
type TempOption = SelectOption & { code: string };
type AccountTypeOption = SelectOption & { slug?: string | null };

type Masters = {
  stages: StageOption[];
  statuses: StatusOption[];
  temperatures: TempOption[];
  sources: SelectOption[];
  accountTypes: AccountTypeOption[];
  callers: SelectOption[];
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
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" } as CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" } as CSSProperties,
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
    color: "#DC2626",
    border: "1px solid #DC2626",
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
  currentUser,
}: {
  lead: any;
  masters: Masters;
  currentUser: { id: string; full_name: string; role: string };
}) {
  const router = useRouter();

  const isManagerOrAbove =
    currentUser.role === "manager" || currentUser.role === "admin";

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
      const corporateType = masters.accountTypes.find((t) => t.slug === "corporate");
      if (corporateType) return corporateType.value;
    }
    return "";
  };

  const [values, setValues] = useState({
    lead_name: lead.lead_name ?? "",
    account_type_id: getInitialAccountTypeId(),
    company_name: lead.company_name ?? "",
    stage_id: lead.stage_id ?? "",
    status_id: lead.status_id ?? "",
    category_id: lead.category_id ?? "",
    temperature_id: lead.temperature_id ?? "",
    score: lead.score != null ? String(lead.score) : "",
    url: lead.url ?? "",
    phone: lead.phone ?? "",
    lead_source_id: lead.lead_source_id ?? "",
    large_segment_id: lead.large_segment_id ?? "",
    small_segment_id: lead.small_segment_id ?? "",
    primary_caller_id: lead.primary_caller_id ?? "",
    owner_user_id: lead.owner_user_id ?? currentUser.id,
  });

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [promoteMessage, setPromoteMessage] = useState<string | null>(null);
  const [promoteWarning, setPromoteWarning] = useState<string | null>(null);
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

  const isOpportunityStage = useMemo(
    () =>
      values.stage_id
        ? masters.stages.some(
            (s) => s.value === values.stage_id && s.slug === "opportunity"
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

  // 企業名入力時: account_type_id が未選択なら法人（slug: corporate）を自動設定
  // 昇格済みの場合は変更不可なので何もしない
  const handleCompanyNameChange = (companyName: string) => {
    if (isPromoted) return;
    setValues((v) => {
      const nextValues = { ...v, company_name: companyName };
      if (!v.account_type_id && companyName) {
        const corporateType = masters.accountTypes.find((t) => t.slug === "corporate");
        if (corporateType) {
          nextValues.account_type_id = corporateType.value;
        }
      }
      return nextValues;
    });
  };

  // Opportunity 昇格確認モーダルを表示すべきか
  // （既に promoted_deal_id がある場合はモーダル不要）
  const needsPromoteConfirm = useMemo(() => {
    if (promotedDealId) return false;
    return isOpportunityStage && values.stage_id !== (lead.stage_id ?? "");
  }, [isOpportunityStage, values.stage_id, lead.stage_id, promotedDealId]);

  // 昇格する事業者種別を判定（法人か個人か）
  const isCorporateSelected = useMemo(() => {
    const selected = masters.accountTypes.find((t) => t.value === values.account_type_id);
    return selected?.slug === "corporate" || selected?.slug === "government";
  }, [masters.accountTypes, values.account_type_id]);

  // 保存ボタンの disabled 判定:
  // 通常ステージ（非 Opportunity）でステータスが未選択の場合はサーバー側でエラーになるため先制制御
  const isSaveDisabled =
    saving || (!isOpportunityStage && !!values.stage_id && !values.status_id);

  // 保存処理の本体（昇格確認後または昇格不要時に呼ばれる）
  // 戻り値: { redirectTo: string | null; error: string | null }
  const executeSave = async (): Promise<{ redirectTo: string | null; error: string | null; promoteError?: string }> => {
    setSaving(true);
    setSaveError(null);
    setPromoteMessage(null);
    setPromoteWarning(null);

    const scoreNum =
      values.score.trim() === "" ? null : parseInt(values.score, 10);
    if (
      scoreNum !== null &&
      (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100)
    ) {
      setSaving(false);
      setSaveError("スコアは 0〜100 の整数を入力してください");
      return { redirectTo: null, error: "スコアは 0〜100 の整数を入力してください" };
    }

    const payload = {
      id: lead.id,
      lead_name: values.lead_name,
      account_type_id: values.account_type_id || undefined,
      company_name: values.company_name || null,
      stage_id: values.stage_id || undefined,
      status_id: values.status_id || null,
      category_id: values.category_id || null,
      temperature_id: values.temperature_id || null,
      score: scoreNum,
      url: values.url || null,
      phone: values.phone || null,
      lead_source_id: values.lead_source_id || null,
      large_segment_id: values.large_segment_id || null,
      small_segment_id: values.small_segment_id || null,
      primary_caller_id: values.primary_caller_id || null,
      owner_user_id: values.owner_user_id || undefined,
    };

    const result = await updateLead(payload);
    setSaving(false);

    if (result.error) {
      if (result.error.includes("Deal昇格に失敗")) {
        // リード本体の更新は成功しているが昇格に失敗 → 警告を表示しつつ詳細へ遷移
        setPromoteWarning(result.error);
        return { redirectTo: `/leads/${lead.id}`, error: null, promoteError: result.error };
      } else {
        setSaveError(result.error);
        return { redirectTo: null, error: result.error };
      }
    }

    const updatedLead = result.data as any;
    if (
      updatedLead?.promoted_deal_id &&
      updatedLead.promoted_deal_id !== promotedDealId
    ) {
      setPromotedDealId(updatedLead.promoted_deal_id);
      setPromoteMessage("Deal に昇格しました！");
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

  // 昇格確認モーダルの onConfirm（ConfirmDialog 用に { error } を返す形式）
  const handlePromoteConfirm = async (): Promise<{ error: string | null }> => {
    const result = await executeSave();
    if (result.error) {
      return { error: result.error };
    }
    // 成功（昇格エラーの有無に関わらずリダイレクト先が決まっている場合）
    // モーダルを閉じた後に router.replace する
    if (result.redirectTo) {
      // モーダルを先に閉じてからリダイレクト（state の競合を防ぐ）
      setPromoteConfirmOpen(false);
      // 次の tick でリダイレクト
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
          resolve({ error: result.error });
          return;
        }
        // 削除成功: リダイレクトのみ（refresh は一覧ページで自動取得されるため不要）
        router.push("/leads");
        resolve({ error: null });
      });
    });
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
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

      {/* Opportunity 昇格確認ダイアログ */}
      <PromoteConfirmDialog
        open={promoteConfirmOpen}
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

      {/* Deal 昇格メッセージ */}
      {promoteMessage && (
        <div
          style={{
            backgroundColor: "rgba(122,165,146,0.15)",
            border: "1px solid #7AA592",
            borderRadius: "var(--radius-card)",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            color: "#4D7A65",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {promoteMessage}
          {promotedDealId && (
            <Link
              href={`/deals/${promotedDealId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                color: "var(--color-terra)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              ディールを見る
              <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
      )}
      {promoteWarning && (
        <div
          style={{
            backgroundColor: "rgba(229,196,127,0.2)",
            border: "1px solid #E5C47F",
            borderRadius: "var(--radius-card)",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            color: "#8A6D1E",
            fontSize: "0.875rem",
          }}
        >
          <strong>Deal 昇格に問題が発生しました:</strong> {promoteWarning}
        </div>
      )}
      {saveError && <p style={styles.error}>{saveError}</p>}

      {/* === 基本情報 === */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          基本情報
        </h2>
        <div style={{ ...styles.grid2, marginBottom: "1rem" }}>
          <div style={{ gridColumn: "1 / -1" }}>
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
                昇格後はカンパニー/コンタクトに紐付けられているため、ここでは変更できません。カンパニー詳細から修正してください
              </p>
            )}
          </div>
          <div>
            <label style={styles.label}>企業名（仮）</label>
            <input
              type="text"
              style={{
                ...styles.input,
                ...(isPromoted ? { backgroundColor: "var(--color-sumi50)", color: "var(--color-sumi500)", cursor: "not-allowed" } : {}),
              }}
              value={values.company_name}
              onChange={(e) => handleCompanyNameChange(e.target.value)}
              placeholder="DB未登録企業の仮入力用"
              disabled={isPromoted}
              onFocus={isPromoted ? undefined : onFocus}
              onBlur={isPromoted ? undefined : onBlur}
            />
            {isPromoted ? (
              <p style={{ ...styles.helpText, color: "var(--color-sumi500)" }}>
                昇格後はカンパニー/コンタクトに紐付けられているため、ここでは変更できません。カンパニー詳細から修正してください
              </p>
            ) : (
              <p style={styles.helpText}>
                Opportunity 昇格時に自動で Company が作成されます
              </p>
            )}
          </div>
          <div>
            <label style={styles.label}>電話番号</label>
            <input
              type="tel"
              style={styles.input}
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
          <div>
            <label style={styles.label}>URL</label>
            <input
              type="url"
              style={styles.input}
              value={values.url}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://"
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
          <div>
            <label style={styles.label}>流入元</label>
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
          <div>
            <label style={styles.label}>担当者</label>
            <select
              style={styles.input}
              value={values.owner_user_id}
              onChange={(e) => set("owner_user_id", e.target.value)}
              disabled={!isManagerOrAbove}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              {masters.owners.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ステージ・ステータス（Cascading） */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          ステージ・ステータス
        </h2>
        <div style={styles.grid2}>
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
              「Opportunity」ステージに変更して保存すると Deal 昇格が試みられます
            </p>
          </div>
          <div>
            <label style={styles.label}>ステータス</label>
            {isOpportunityStage ? (
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
            {isOpportunityStage && (
              <p style={{ ...styles.helpText, color: "var(--color-terra)" }}>
                このステージでは Deal が自動生成されます
              </p>
            )}
            {!isOpportunityStage && values.stage_id && !values.status_id && (
              <p style={{ ...styles.helpText, color: "var(--color-error)" }}>
                ステータスを選択してください
              </p>
            )}
          </div>
        </div>
      </div>

      {/* カテゴリ */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          カテゴリ
        </h2>
        <div style={{ maxWidth: 320 }}>
          <label style={styles.label}>カテゴリ</label>
          <select
            style={styles.input}
            value={values.category_id}
            onChange={(e) => set("category_id", e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
          >
            <option value="">-- 未設定 --</option>
            {masters.categories.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* スコア・温度感 */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          スコア・温度感
        </h2>
        <div style={styles.grid2}>
          <div>
            <label style={styles.label}>スコア（0-100）</label>
            <input
              type="number"
              min={0}
              max={100}
              style={styles.input}
              value={values.score}
              onChange={(e) => set("score", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
            <p
              style={{
                ...styles.helpText,
                display: "flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <Thermometer size={12} />
              入力すると温度感を自動判定します
            </p>
          </div>
          <div>
            <label style={styles.label}>温度感</label>
            <select
              style={styles.input}
              value={values.temperature_id}
              onChange={(e) => set("temperature_id", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- スコアから自動判定 --</option>
              {masters.temperatures.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 主担・セグメント */}
      <div style={styles.card}>
        <h2
          style={{
            color: "var(--color-text-title)",
            fontSize: "1rem",
            fontWeight: 600,
            margin: "0 0 1rem 0",
          }}
        >
          主担・セグメント
        </h2>
        <div style={styles.grid3}>
          <div>
            <label style={styles.label}>主担当</label>
            <select
              style={styles.input}
              value={values.primary_caller_id}
              onChange={(e) => set("primary_caller_id", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 未選択 --</option>
              {masters.callers.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
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
        </div>
      </div>

      {/* ページ下部にも保存・キャンセルボタン */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.75rem",
          marginTop: "0.5rem",
        }}
      >
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

// ---- Opportunity 昇格確認ダイアログ ----
function PromoteConfirmDialog({
  open,
  isCorporate,
  onConfirm,
  onClose,
}: {
  open: boolean;
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
    // 成功時は onConfirm 側（handlePromoteConfirm）でモーダルクローズ + リダイレクトを制御済みなのでここでは onClose を呼ばない
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
  const footerStyle: CSSProperties = {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "flex-end",
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
        <h2 style={titleStyle}>Opportunity に昇格します</h2>
        <div style={bodyStyle}>
          <p style={{ margin: "0 0 0.5rem 0" }}>
            この操作により、以下が自動生成されます:
          </p>
          {isCorporate ? (
            <ul style={listStyle}>
              <li>カンパニー</li>
              <li>コンタクト</li>
              <li>アカウント</li>
              <li>ディール</li>
            </ul>
          ) : (
            <ul style={listStyle}>
              <li>コンタクト</li>
              <li>アカウント</li>
              <li>ディール</li>
            </ul>
          )}
          <p style={{ margin: "0.5rem 0 0 0" }}>
            生成された後に自動で削除することはできません。続けますか？
          </p>
        </div>
        {error && (
          <p style={{ color: "var(--color-error)", fontSize: "0.875rem", margin: "0 0 0.75rem 0" }}>
            {error}
          </p>
        )}
        <div style={footerStyle}>
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

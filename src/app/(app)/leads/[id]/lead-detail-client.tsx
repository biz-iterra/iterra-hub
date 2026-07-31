"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  ClipboardList,
  Megaphone,
  FileText,
  ArrowUpRight,
  Trash2,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Activity,
  Plus,
  Building2,
  Users,
  Layers,
} from "lucide-react";
import { createLeadActivity, deleteLeadActivity, updateLeadActivity } from "@/actions/lead-activities";
import {
  createLeadCustomerActivity,
  deleteLeadCustomerActivity,
} from "@/actions/leads";
import {
  TemperatureBadge,
  StageBadge,
  StatusBadge,
  CategoryBadge,
  ActivityTypeBadge,
} from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { DetailSection, detailHeadingStyle } from "@/components/ui/DetailSection";
import type {
  LeadActivityWithRelations,
  LeadDetail,
} from "@/types/relations";
import {
  detailContainerStyle,
  detailGridStyle,
  fieldGridStyle,
  sectionStackStyle,
} from "@/lib/layout";

/** lead.customer_activities の要素（LEAD_SELECT の customer_activities に対応） */
type LeadCustomerActivity = LeadDetail["customer_activities"][number];

type Tab = "basic" | "score" | "customer_activities" | "activities" | "campaigns";
type CampaignRef = { id: string; name: string };

type SelectOption = { value: string; label: string };
type StatusOption = SelectOption & { stage_id: string };
type SmallSegmentOption = SelectOption & { large_segment_id: string | null };
type StageOption = SelectOption & { slug?: string };
type TempOption = SelectOption & { code: string };
type ActivityTypeOption = SelectOption & { color: string | null };

type Masters = {
  stages: StageOption[];
  statuses: StatusOption[];
  temperatures: TempOption[];
  sources: SelectOption[];
  accountTypes: SelectOption[];
  callStatuses: SelectOption[];
  largeSegments: SelectOption[];
  smallSegments: SmallSegmentOption[];
  owners: SelectOption[];
  categories: SelectOption[];
  activityTypes: ActivityTypeOption[];
  customerActivityTypes: SelectOption[];
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
  value: {
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
    lineHeight: 1.5,
  } as CSSProperties,
  valueEmpty: {
    fontSize: "0.875rem",
    color: "var(--color-sumi400)",
    lineHeight: 1.5,
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
  grid2: fieldGridStyle,
  grid3: fieldGridStyle,
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
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
};

/** 取込で紐付いた法人情報・連絡先へのリンク（タイトル下のバッジ列に並べる） */
const linkedEntityStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  color: "var(--color-terra)",
  fontSize: "0.75rem",
  fontWeight: 500,
  textDecoration: "none",
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


/** ラベル+値のペア表示（閲覧専用フィールド） */
function Field({
  label,
  value,
  empty = "—",
}: {
  label: string;
  value?: string | number | null;
  empty?: string;
}) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div>
      <span style={styles.label}>{label}</span>
      <p style={{ margin: 0, ...(isEmpty ? styles.valueEmpty : styles.value) }}>
        {isEmpty ? empty : value}
      </p>
    </div>
  );
}

/** アコーディオン行（社内対応履歴） */
function ActivityAccordionItem({
  act,
  isAdmin,
  canEdit,
  deletingActId,
  onDelete,
  onEdit,
}: {
  act: LeadActivityWithRelations;
  isAdmin: boolean;
  canEdit: boolean;
  deletingActId: string | null;
  onDelete: (id: string) => void;
  onEdit: (act: LeadActivityWithRelations) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--color-border-default)",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
          padding: "0.625rem 0.5rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          borderRadius: "var(--radius-sm)",
          transition: "background-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "var(--color-bg-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.backgroundColor =
            "transparent";
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            flex: 1,
          }}
        >
          <span
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--color-sumi700)",
              whiteSpace: "nowrap",
            }}
          >
            {act.called_on}
            {act.called_at_time ? ` ${act.called_at_time.slice(0, 5)}` : ""}
          </span>

          {act.activity_type?.name && (
            <ActivityTypeBadge
              name={act.activity_type.name}
              color={act.activity_type.color ?? null}
            />
          )}

          {act.call_status?.name && (
            <StatusBadge name={act.call_status.name} color={act.call_status.color} />
          )}

          {act.caller?.full_name && (
            <span
              style={{
                color: "var(--color-sumi600)",
                fontSize: "0.75rem",
              }}
            >
              {act.caller.full_name}
            </span>
          )}
        </div>

        <span style={{ color: "var(--color-sumi500)", flexShrink: 0 }}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "0.5rem 0.5rem 0.875rem",
          }}
        >
          {act.note ? (
            <p
              style={{
                color: "var(--color-text-body)",
                fontSize: "0.875rem",
                margin: "0 0 0.75rem 0",
                whiteSpace: "pre-wrap",
              }}
            >
              {act.note}
            </p>
          ) : (
            <p
              style={{
                color: "var(--color-sumi400)",
                fontSize: "0.875rem",
                margin: "0 0 0.75rem 0",
              }}
            >
              メモなし
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {canEdit && (
              <button
                data-testid="lead-activity-edit-button"
                onClick={() => onEdit(act)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  color: "var(--color-terra)",
                  backgroundColor: "transparent",
                  border: "1px solid var(--color-terra)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "var(--radius-sm)",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "transparent";
                }}
              >
                <Pencil size={12} />
                編集
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => onDelete(act.id)}
                disabled={deletingActId === act.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  color: "var(--color-error)",
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  padding: "0.25rem 0.375rem",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <Trash2 size={12} />
                {deletingActId === act.id ? "削除中..." : "削除"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** カテゴリ日本語表示 */
function breakdownCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    attribute: "属性",
    interest: "興味",
    stage: "ステージ",
    status: "ステータス",
    activity: "対応",
  };
  return map[cat] ?? cat;
}

/** カテゴリ別バッジスタイル（category → ITERRAトークン色） */
function breakdownCategoryStyle(cat: string): React.CSSProperties {
  // attribute=terra / interest=amber / stage=sage / status=soleil / activity=sumi
  const styleMap: Record<string, React.CSSProperties> = {
    attribute: {
      backgroundColor: "rgba(60,63,88,0.1)",
      color: "var(--color-terra)",
    },
    interest: {
      backgroundColor: "rgba(229,196,127,0.25)",
      color: "#8A6D1E",
    },
    stage: {
      backgroundColor: "rgba(122,165,146,0.18)",
      color: "#4D7A65",
    },
    status: {
      backgroundColor: "rgba(215,119,93,0.15)",
      color: "#A34E35",
    },
    activity: {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    },
  };
  return styleMap[cat] ?? { backgroundColor: "var(--color-sumi100)", color: "var(--color-sumi700)" };
}

/** 社内対応アクティビティ編集モーダル */
function LeadActivityEditModal({
  act,
  masters,
  onClose,
  onSaved,
}: {
  act: LeadActivityWithRelations;
  masters: Masters;
  onClose: () => void;
  onSaved: (updated: LeadActivityWithRelations) => void;
}) {
  const [form, setForm] = useState({
    called_on: act.called_on ?? new Date().toISOString().slice(0, 10),
    called_at_time: act.called_at_time ? act.called_at_time.slice(0, 5) : "",
    call_status_id: act.call_status?.id ?? act.call_status_id ?? "",
    caller_user_id: act.caller?.id ?? act.caller_user_id ?? "",
    activity_type_id: act.activity_type?.id ?? act.activity_type_id ?? "",
    note: act.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  // 必須項目の未入力（入力箇所に紐づく検証）はインラインのまま
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const setF = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.call_status_id || !form.caller_user_id) {
      setError("対応ステータスと対応者は必須です");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateLeadActivity({
      id: act.id,
      called_on: form.called_on,
      called_at_time: form.called_at_time || null,
      call_status_id: form.call_status_id,
      caller_user_id: form.caller_user_id,
      activity_type_id: form.activity_type_id || null,
      note: form.note || null,
    });
    setSaving(false);
    if (result.error || !result.data) {
      showToast({ type: "error", message: result.error ?? "保存結果を取得できませんでした" });
      return;
    }
    showToast({ type: "success", message: "対応履歴を更新しました" });
    onSaved(result.data);
    onClose();
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
    maxWidth: 520,
    width: "100%",
    padding: "1.5rem",
    maxHeight: "90vh",
    overflowY: "auto",
  };

  return (
    <div style={overlayStyle} onClick={saving ? undefined : onClose} data-testid="lead-activity-edit-modal">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: "var(--color-text-title)", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          社内対応を編集
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {/* 対応日 */}
          <div>
            <label style={styles.label} htmlFor="edit-act-called-on">対応日 *</label>
            <input
              id="edit-act-called-on"
              data-testid="lead-activity-edit-called-on"
              type="date"
              style={styles.input}
              value={form.called_on}
              onChange={(e) => setF("called_on", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          {/* 対応時刻 */}
          <div>
            <label style={styles.label} htmlFor="edit-act-called-at-time">対応時刻</label>
            <input
              id="edit-act-called-at-time"
              data-testid="lead-activity-edit-called-at-time"
              type="time"
              style={styles.input}
              value={form.called_at_time}
              onChange={(e) => setF("called_at_time", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          {/* 対応種別 */}
          <div>
            <label style={styles.label} htmlFor="edit-act-activity-type">対応種別</label>
            <select
              id="edit-act-activity-type"
              data-testid="lead-activity-edit-activity-type"
              style={styles.input}
              value={form.activity_type_id}
              onChange={(e) => setF("activity_type_id", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 未選択 --</option>
              {masters.activityTypes.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 対応ステータス */}
          <div>
            <label style={styles.label} htmlFor="edit-act-call-status">対応ステータス *</label>
            <select
              id="edit-act-call-status"
              data-testid="lead-activity-edit-call-status"
              style={styles.input}
              value={form.call_status_id}
              onChange={(e) => setF("call_status_id", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 選択 --</option>
              {masters.callStatuses.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 対応者 */}
          <div>
            <label style={styles.label} htmlFor="edit-act-caller">対応者 *</label>
            <select
              id="edit-act-caller"
              data-testid="lead-activity-edit-caller"
              style={styles.input}
              value={form.caller_user_id}
              onChange={(e) => setF("caller_user_id", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            >
              <option value="">-- 選択 --</option>
              {masters.owners.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* メモ */}
          <div>
            <label style={styles.label} htmlFor="edit-act-note">メモ</label>
            <textarea
              id="edit-act-note"
              data-testid="lead-activity-edit-note"
              rows={4}
              style={{ ...styles.input, resize: "vertical" }}
              value={form.note}
              onChange={(e) => setF("note", e.target.value)}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button style={styles.btnOutline} onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button
            data-testid="lead-activity-edit-save"
            style={styles.btnPrimary}
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存する"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 顧客行動ログ追加モーダル */
function CustomerActivityModal({
  leadId,
  customerActivityTypes,
  onClose,
  onSaved,
}: {
  leadId: string;
  customerActivityTypes: SelectOption[];
  onClose: () => void;
  onSaved: (item: LeadCustomerActivity) => void;
}) {
  const [form, setForm] = useState({
    activity_type_id: "",
    occurred_at: new Date().toISOString().slice(0, 16),
    detail: "",
    source: "",
  });
  const [saving, setSaving] = useState(false);
  // 必須項目の未入力（入力箇所に紐づく検証）はインラインのまま
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const setF = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.activity_type_id) {
      setError("行動タイプは必須です");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await createLeadCustomerActivity({
      lead_id: leadId,
      activity_type_id: form.activity_type_id,
      occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : undefined,
      detail: form.detail || null,
      source: form.source || null,
    });
    setSaving(false);
    if (result.error || !result.data) {
      showToast({ type: "error", message: result.error ?? "保存結果を取得できませんでした" });
      return;
    }
    showToast({ type: "success", message: "顧客行動ログを追加しました" });
    onSaved(result.data);
    onClose();
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

  return (
    <div style={overlayStyle} onClick={saving ? undefined : onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: "var(--color-text-title)", fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          顧客行動ログを追加
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div>
            <label style={styles.label}>行動タイプ *</label>
            <select style={styles.input} value={form.activity_type_id}
              onChange={(e) => setF("activity_type_id", e.target.value)}
              onFocus={onFocus} onBlur={onBlur}>
              <option value="">-- 選択 --</option>
              {customerActivityTypes.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={styles.label}>発生日時</label>
            <input type="datetime-local" style={styles.input} value={form.occurred_at}
              onChange={(e) => setF("occurred_at", e.target.value)}
              onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <label style={styles.label}>詳細</label>
            <textarea rows={3} style={{ ...styles.input, resize: "vertical" }}
              value={form.detail}
              onChange={(e) => setF("detail", e.target.value)}
              onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <label style={styles.label}>ソース</label>
            <input type="text" style={styles.input} value={form.source}
              onChange={(e) => setF("source", e.target.value)}
              placeholder="例: Webフォーム、メール等"
              onFocus={onFocus} onBlur={onBlur} />
          </div>
        </div>
        {error && <p style={styles.error}>{error}</p>}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button style={styles.btnOutline} onClick={onClose} disabled={saving}>キャンセル</button>
          <button style={styles.btnPrimary} onClick={handleSubmit} disabled={saving}>
            {saving ? "追加中..." : "追加する"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeadDetailClient({
  lead,
  activities: initialActivities,
  masters,
  currentUser,
  initialLeadCampaigns = [],
}: {
  lead: LeadDetail;
  activities: LeadActivityWithRelations[];
  masters: Masters;
  currentUser: { id: string; full_name: string; role: string };
  initialLeadCampaigns?: CampaignRef[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("basic");
  const { showToast } = useToast();

  const isAdmin = currentUser.role === "admin";
  const isManagerOrAbove =
    currentUser.role === "manager" || currentUser.role === "admin";
  const isOwnerOrAbove =
    isManagerOrAbove || lead.owner_user_id === currentUser.id;

  const promotedDealId: string | null = lead.promoted_deal_id ?? null;

  // ---- 社内対応アクティビティ ----
  const [activities, setActivities] = useState(initialActivities);
  const [actForm, setActForm] = useState({
    called_on: new Date().toISOString().slice(0, 10),
    called_at_time: "",
    call_status_id: "",
    caller_user_id: "",
    activity_type_id: "",
    note: "",
  });
  // 必須項目の未入力（入力箇所に紐づく検証）はインラインのまま
  const [actError, setActError] = useState<string | null>(null);
  const [actSaving, setActSaving] = useState(false);
  const [deletingActId, setDeletingActId] = useState<string | null>(null);
  const [editingAct, setEditingAct] = useState<LeadActivityWithRelations | null>(null);

  const setAct = <K extends keyof typeof actForm>(
    key: K,
    value: (typeof actForm)[K]
  ) => {
    setActForm((v) => ({ ...v, [key]: value }));
  };

  const handleAddActivity = async () => {
    if (!actForm.call_status_id || !actForm.caller_user_id) {
      setActError("対応ステータスと対応者は必須です");
      return;
    }
    setActSaving(true);
    setActError(null);

    const result = await createLeadActivity({
      lead_id: lead.id,
      called_on: actForm.called_on,
      called_at_time: actForm.called_at_time || null,
      call_status_id: actForm.call_status_id,
      caller_user_id: actForm.caller_user_id,
      activity_type_id: actForm.activity_type_id || null,
      note: actForm.note || null,
    });
    setActSaving(false);
    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    if (!result.data) {
      showToast({ type: "error", message: "登録結果を取得できませんでした" });
      return;
    }
    const created = result.data;
    setActivities((prev) => [created, ...prev]);
    setActForm({
      called_on: new Date().toISOString().slice(0, 10),
      called_at_time: "",
      call_status_id: "",
      caller_user_id: "",
      activity_type_id: "",
      note: "",
    });
    showToast({ type: "success", message: "対応履歴を追加しました" });
  };

  const handleDeleteActivity = async (actId: string) => {
    setDeletingActId(actId);
    const result = await deleteLeadActivity(actId);
    setDeletingActId(null);
    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== actId));
    showToast({ type: "success", message: "対応履歴を削除しました" });
  };

  const handleEditActivitySaved = (updated: LeadActivityWithRelations) => {
    setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  // ---- 顧客行動ログ ----
  const [customerActivities, setCustomerActivities] = useState<LeadCustomerActivity[]>(
    () => (lead.customer_activities ?? []).slice().sort(
      (a, b) => new Date(b.occurred_at ?? b.created_at).getTime() - new Date(a.occurred_at ?? a.created_at).getTime()
    )
  );
  const [showAddCustomerActivity, setShowAddCustomerActivity] = useState(false);
  const [deletingCaId, setDeletingCaId] = useState<string | null>(null);

  const handleDeleteCustomerActivity = async (caId: string) => {
    setDeletingCaId(caId);
    const result = await deleteLeadCustomerActivity(caId);
    setDeletingCaId(null);
    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    setCustomerActivities((prev) => prev.filter((a) => a.id !== caId));
    showToast({ type: "success", message: "顧客行動ログを削除しました" });
  };

  // ---- キャンペーン（参照のみ）----
  const attachedCampaigns = initialLeadCampaigns;

  const tabBase: CSSProperties = {
    padding: "0.625rem 1.25rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    backgroundColor: "transparent",
    transition: "color 0.15s, border-color 0.15s",
  };

  // マスタ名前解決ヘルパー
  const findLabel = (list: SelectOption[], id?: string | null) =>
    id ? (list.find((o) => o.value === id)?.label ?? null) : null;

  // スコア内訳
  const scoreBreakdowns = lead.score_breakdowns ?? [];
  const sumDelta = scoreBreakdowns.reduce((acc, b) => acc + (b.score_delta ?? 0), 0);

  return (
    <div style={detailContainerStyle}>
      {/* Back */}
      <Link
        href="/leads"
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
        リード一覧
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          {/* カテゴリ + 温度感バッジ（タイトル上） */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {lead.category?.name && (
              <CategoryBadge name={lead.category.name} color={lead.category.color} />
            )}
            {lead.temperature && (
              <TemperatureBadge
                code={lead.temperature.code}
                name={lead.temperature.name}
              />
            )}
          </div>

          {/* リード名（タイトル） */}
          <h1
            style={{
              color: "var(--color-text-title)",
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {lead.lead_name}
          </h1>

          {/* ステージ + ステータス バッジ（タイトル下） */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {lead.stage?.name && (
              <StageBadge
                name={lead.stage.name}
                color={lead.stage.color}
                sortOrder={lead.stage.sort_order}
                total={masters.stages.length}
              />
            )}
            {lead.status?.name && (
              <StatusBadge
                name={lead.status.name}
                color={lead.status.color}
                sortOrder={lead.status.sort_order}
                total={masters.statuses.length}
              />
            )}
            {/*
              名刺はリードであると同時に連絡先でもあるため、取込時点で
              法人情報・連絡先に紐付いている。昇格を待たずにそちらへ辿れるようにする。
            */}
            {lead.linked_company && (
              <Link
                href={`/companies/${lead.linked_company.id}`}
                style={linkedEntityStyle}
              >
                <Building2 size={12} />
                {lead.linked_company.name}
                <ArrowUpRight size={12} />
              </Link>
            )}
            {lead.linked_contact && (
              <Link
                href={`/contacts/${lead.linked_contact.id}`}
                style={linkedEntityStyle}
              >
                <Users size={12} />
                {`${lead.linked_contact.last_name ?? ""} ${lead.linked_contact.first_name ?? ""}`.trim()}
                <ArrowUpRight size={12} />
              </Link>
            )}
            {promotedDealId && (
              <Link
                href={`/deals/${promotedDealId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  color: "var(--color-terra)",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                商談昇格済み
                <ArrowUpRight size={12} />
              </Link>
            )}
          </div>
        </div>

        {isOwnerOrAbove && (
          <Link
            href={`/leads/${lead.id}/edit`}
            className="hover:opacity-90"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              backgroundColor: "var(--color-terra)",
              color: "#fff",
              borderRadius: "var(--radius-button)",
              padding: "0.5rem 1.25rem",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: "0.875rem",
            }}
          >
            <Pencil size={14} />
            編集
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          borderBottom: "1px solid var(--color-border-default)",
          marginBottom: "1.5rem",
          display: "flex",
          gap: "0",
          overflowX: "auto",
          scrollbarWidth: "none",
        }}
      >
        {(
          [
            { key: "basic", label: "基本情報", icon: FileText },
            { key: "score", label: "スコア", icon: BarChart2 },
            { key: "customer_activities", label: "顧客行動", icon: Activity },
            { key: "activities", label: "社内対応", icon: ClipboardList },
            { key: "campaigns", label: "キャンペーン", icon: Megaphone },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              ...tabBase,
              color:
                activeTab === key
                  ? "var(--color-terra)"
                  : "var(--color-sumi600)",
              borderBottomColor:
                activeTab === key ? "var(--color-terra)" : "transparent",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              <Icon size={15} />
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* === 基本情報タブ（閲覧専用）=== */}
      {activeTab === "basic" && (
        <div style={sectionStackStyle}>
          {/* ① 企業情報セクション */}
          <DetailSection title="企業情報" icon={Building2}>
            <div style={{ ...styles.grid2, marginBottom: "1rem" }}>
              <Field label="会社名" value={lead.company_name} />
              <Field label="フリガナ" value={lead.company_name_kana} />
              <Field label="代表者名" value={lead.representative_name} />
              <Field label="法人番号" value={lead.corporate_number} />
              <Field label="代表電話" value={lead.company_phone} />
              <Field label="企業URL" value={lead.url} />
            </div>
            <div style={styles.grid3}>
              <Field
                label="従業員数"
                value={lead.employee_count != null ? `${lead.employee_count.toLocaleString()} 名` : null}
              />
              <Field
                label="資本金"
                value={lead.capital != null ? `${lead.capital.toLocaleString()} 円` : null}
              />
              <div>
                <span style={styles.label}>企業規模</span>
                {lead.company_size ? (
                  <div style={{ marginTop: "0.125rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.125rem 0.625rem",
                        borderRadius: "var(--radius-badge)",
                        backgroundColor: "var(--color-sumi100)",
                        color: "var(--color-sumi700)",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                      }}
                    >
                      {lead.company_size.name}
                    </span>
                    <p style={{ ...styles.helpText, marginTop: "0.25rem" }}>自動判定</p>
                  </div>
                ) : (
                  <p style={{ margin: 0, ...styles.valueEmpty }}>—</p>
                )}
              </div>
            </div>
          </DetailSection>

          {/* ② 担当者情報セクション */}
          <DetailSection title="担当者情報" icon={Users}>
            <div style={{ ...styles.grid3, marginBottom: "1rem" }}>
              <Field label="姓" value={lead.contact_last_name} />
              <Field label="ミドルネーム" value={lead.contact_middle_name} />
              <Field label="名" value={lead.contact_first_name} />
            </div>
            <div style={{ ...styles.grid3, marginBottom: "1rem" }}>
              <Field label="姓（カナ）" value={lead.contact_last_name_kana} />
              <Field label="ミドル（カナ）" value={lead.contact_middle_name_kana} />
              <Field label="名（カナ）" value={lead.contact_first_name_kana} />
            </div>
            <div style={{ ...styles.grid2, marginBottom: "1rem" }}>
              <Field label="部署" value={lead.contact_department} />
              <Field label="役職" value={lead.contact_job_title} />
            </div>
            <div style={styles.grid2}>
              <Field label="メール" value={lead.contact_email} />
              <Field label="担当者電話" value={lead.contact_phone} />
            </div>
          </DetailSection>

          {/* ③ リード属性セクション */}
          <DetailSection title="リード属性" icon={Layers}>
            <div style={{ ...styles.grid3, marginBottom: "1rem" }}>
              <Field
                label="大分類セグメント"
                value={lead.large_segment?.name ?? findLabel(masters.largeSegments, lead.large_segment_id)}
              />
              <Field
                label="小分類セグメント"
                value={lead.small_segment?.name ?? findLabel(masters.smallSegments, lead.small_segment_id)}
              />
              <Field
                label="リードソース"
                value={lead.lead_source?.name ?? findLabel(masters.sources, lead.lead_source_id)}
              />
            </div>
            <div style={styles.grid2}>
              <Field
                label="事業者種別"
                value={lead.account_type?.name ?? findLabel(masters.accountTypes, lead.account_type_id)}
              />
              <Field
                label="社内担当者（主）"
                value={lead.owner?.full_name ?? findLabel(masters.owners, lead.owner_user_id)}
              />
            </div>
            {lead.sub_owners && lead.sub_owners.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <span style={styles.label}>社内担当者（副）</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginTop: "0.25rem" }}>
                  {lead.sub_owners.map((o) => (
                    <span
                      key={o.user_id}
                      style={{
                        display: "inline-block",
                        padding: "0.125rem 0.625rem",
                        borderRadius: "var(--radius-badge)",
                        backgroundColor: "var(--color-sumi100)",
                        color: "var(--color-sumi700)",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                      }}
                    >
                      {o.user?.full_name ?? o.user_id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </DetailSection>
        </div>
      )}

      {/* === スコアタブ === */}
      {activeTab === "score" && (
        <div style={sectionStackStyle}>
          {/* スコアサマリ */}
          <DetailSection title="スコアサマリ" icon={BarChart2}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "2rem", flexWrap: "wrap" }}>
              {/* 大きいスコア数字 */}
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "5.5rem",
                    height: "5.5rem",
                    borderRadius: "50%",
                    background: "var(--gradient-iterra)",
                    boxShadow: "var(--elevation-medium)",
                  }}
                >
                  <span
                    style={{
                      fontSize: "2.25rem",
                      fontWeight: 700,
                      color: "#fff",
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {lead.score ?? 0}
                  </span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-sumi500)", marginTop: "0.5rem" }}>
                  スコア (0-100)
                </div>
              </div>
              {/* 温度感バッジ */}
              <div>
                <span style={styles.label}>温度感</span>
                {lead.temperature ? (
                  <div style={{ marginTop: "0.25rem" }}>
                    <TemperatureBadge
                      code={lead.temperature.code}
                      name={lead.temperature.name}
                    />
                  </div>
                ) : (
                  <p style={{ margin: 0, ...styles.valueEmpty }}>—</p>
                )}
              </div>
              {/* 合計表示 */}
              {scoreBreakdowns.length > 0 && (
                <div style={{ marginLeft: "auto" }}>
                  <span style={{ ...styles.label }}>内訳合計 / 実スコア</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--color-sumi600)" }}>
                      内訳合計
                      <span style={{ fontWeight: 700, color: "var(--color-text-title)", marginLeft: "0.25rem" }}>
                        {sumDelta} 点
                      </span>
                    </span>
                    <span style={{ color: "var(--color-sumi400)", fontSize: "0.875rem" }}>→</span>
                    <span style={{ fontSize: "0.875rem", color: "var(--color-sumi600)" }}>
                      実スコア
                      <span style={{ fontWeight: 700, color: "var(--color-soleil)", marginLeft: "0.25rem" }}>
                        {lead.score ?? 0} 点
                      </span>
                    </span>
                    {sumDelta > (lead.score ?? 0) && (
                      <span
                        style={{
                          display: "inline-block",
                          backgroundColor: "rgba(229,196,127,0.25)",
                          color: "#8A6D1E",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          padding: "0.125rem 0.5rem",
                          borderRadius: "var(--radius-badge)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        100点でクリップ
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </DetailSection>

          {/* スコア内訳リスト */}
          <DetailSection
            title="スコア内訳"
            icon={ClipboardList}
            action={
              scoreBreakdowns.length > 0 ? (
                <span
                  style={{
                    fontWeight: 400,
                    color: "var(--color-sumi500)",
                    fontSize: "0.8125rem",
                  }}
                >
                  {scoreBreakdowns.length} 件
                </span>
              ) : null
            }
          >
            {scoreBreakdowns.length === 0 ? (
              <p style={{ margin: 0, ...styles.valueEmpty, textAlign: "center", padding: "1.5rem 0" }}>
                スコア内訳がありません（スコア再計算後に表示されます）
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {scoreBreakdowns.map((b, i) => (
                  <div
                    key={b.id ?? i}
                    className="score-breakdown-row"
                    style={{
                      borderBottom: i < scoreBreakdowns.length - 1 ? "1px solid var(--color-border-default)" : "none",
                    }}
                  >
                    {/* デスクトップ用グリッド列 */}
                    <div className="score-breakdown-col-category">
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "var(--radius-badge)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          ...breakdownCategoryStyle(b.rule?.category ?? ""),
                        }}
                      >
                        {breakdownCategoryLabel(b.rule?.category ?? "")}
                      </span>
                    </div>
                    <div className="score-breakdown-col-desc"
                         style={{ fontSize: "0.875rem", color: "var(--color-text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                         title={b.rule?.description ?? undefined}>
                      {b.rule?.description ?? b.rule?.condition_type ?? "—"}
                    </div>
                    <div className="score-breakdown-col-delta" style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-sage)" }}>
                      +{b.score_delta}
                    </div>
                    <div className="score-breakdown-col-date" style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
                      {b.applied_at ? new Date(b.applied_at).toLocaleDateString("ja-JP") : "—"}
                    </div>
                    {/* モバイル用カード内レイアウト */}
                    <div className="score-breakdown-row-inner">
                      <div className="score-breakdown-row-top">
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.125rem 0.5rem",
                            borderRadius: "var(--radius-badge)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            ...breakdownCategoryStyle(b.rule?.category ?? ""),
                          }}
                        >
                          {breakdownCategoryLabel(b.rule?.category ?? "")}
                        </span>
                        <span className="score-breakdown-row-desc" style={{ fontSize: "0.875rem", color: "var(--color-text-body)" }}>
                          {b.rule?.description ?? b.rule?.condition_type ?? "—"}
                        </span>
                      </div>
                      <div className="score-breakdown-row-bottom">
                        <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-sage)" }}>
                          +{b.score_delta} 点
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
                          {b.applied_at ? new Date(b.applied_at).toLocaleDateString("ja-JP") : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {/* 合計行 */}
                <div
                  className="score-breakdown-total-row"
                >
                  <div className="score-breakdown-total-empty" />
                  <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text-title)" }}>合計</div>
                  <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-sage)" }}>+{sumDelta}</div>
                  <div className="score-breakdown-total-date" />
                </div>
              </div>
            )}
          </DetailSection>
        </div>
      )}

      {/* === 顧客行動タブ === */}
      {activeTab === "customer_activities" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            {/* children が単一カードにならないため DetailSection は使わず、見出しの体裁だけ揃える */}
            <h2 style={detailHeadingStyle}>
              顧客行動ログ
              {customerActivities.length > 0 && (
                <span
                  style={{
                    marginLeft: "0.5rem",
                    fontSize: "0.8125rem",
                    fontWeight: 400,
                    color: "var(--color-sumi500)",
                  }}
                >
                  （{customerActivities.length} 件）
                </span>
              )}
            </h2>
            <button
              style={styles.btnPrimary}
              onClick={() => setShowAddCustomerActivity(true)}
            >
              <Plus size={14} />
              行動ログを追加
            </button>
          </div>

          {customerActivities.length === 0 ? (
            <div
              style={{
                ...styles.card,
                textAlign: "center",
                color: "var(--color-sumi500)",
                padding: "2rem 1.5rem",
              }}
            >
              顧客行動ログがありません
            </div>
          ) : (
            <>
              {/* デスクトップ: グリッド表示 */}
              <div
                className="customer-activity-grid-wrapper"
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "var(--radius-card)",
                  boxShadow: "var(--elevation-low)",
                  overflow: "hidden",
                }}
              >
                {customerActivities.map((ca) => (
                  <div
                    key={ca.id}
                    className="customer-activity-row"
                  >
                    <div style={{ fontWeight: 600, color: "var(--color-sumi700)", fontSize: "0.8125rem" }}>
                      {ca.occurred_at
                        ? new Date(ca.occurred_at).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </div>
                    <div>
                      {ca.activity_type?.name ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.125rem 0.5rem",
                            borderRadius: "var(--radius-badge)",
                            backgroundColor: "rgba(122,165,146,0.15)",
                            color: "var(--color-sage)",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ca.activity_type.name}
                        </span>
                      ) : "—"}
                    </div>
                    <div style={{ color: "var(--color-text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                         title={ca.detail ?? undefined}>
                      {ca.detail ?? "—"}
                    </div>
                    <div style={{ color: "var(--color-sumi500)", fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                         title={ca.source ?? undefined}>
                      {ca.source ?? "—"}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteCustomerActivity(ca.id)}
                          disabled={deletingCaId === ca.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            color: "var(--color-error)",
                            backgroundColor: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            padding: "0.25rem",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          <Trash2 size={13} />
                          {deletingCaId === ca.id ? "削除中" : ""}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* モバイル: カード表示（768px 以下） */}
              <div className="customer-activity-cards">
                {customerActivities.map((ca) => (
                  <div key={ca.id} className="customer-activity-card">
                    {/* 上段: 種別バッジ + 発生日時 */}
                    <div className="customer-activity-card-top">
                      {ca.activity_type?.name ? (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.125rem 0.5rem",
                            borderRadius: "var(--radius-badge)",
                            backgroundColor: "rgba(122,165,146,0.15)",
                            color: "var(--color-sage)",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ca.activity_type.name}
                        </span>
                      ) : null}
                      <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-sumi700)" }}>
                        {ca.occurred_at
                          ? new Date(ca.occurred_at).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                    </div>
                    {/* 中段: 詳細（全幅） */}
                    <div className="customer-activity-card-middle">
                      {ca.detail ?? <span style={{ color: "var(--color-sumi400)" }}>—</span>}
                    </div>
                    {/* 下段: 由来 + 操作 */}
                    <div className="customer-activity-card-bottom">
                      <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
                        {ca.source ?? "—"}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteCustomerActivity(ca.id)}
                          disabled={deletingCaId === ca.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            color: "var(--color-error)",
                            backgroundColor: "transparent",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                            padding: "0.25rem",
                            borderRadius: "var(--radius-sm)",
                          }}
                        >
                          <Trash2 size={13} />
                          {deletingCaId === ca.id ? "削除中" : ""}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {showAddCustomerActivity && (
            <CustomerActivityModal
              leadId={lead.id}
              customerActivityTypes={masters.customerActivityTypes}
              onClose={() => setShowAddCustomerActivity(false)}
              onSaved={(item) => {
                setCustomerActivities((prev) => [item, ...prev]);
              }}
            />
          )}
        </div>
      )}

      {/* === 社内対応アクティビティタブ === */}
      {activeTab === "activities" && (
        <div
          style={detailGridStyle}
          className="activities-layout"
        >
          {/* 左カラム: アクティビティ一覧（アコーディオン） */}
          <div>
            {/* 同上。アコーディオン一覧が続くのでカードで囲まない */}
            <h2 style={{ ...detailHeadingStyle, marginBottom: "0.75rem" }}>
              社内対応履歴
              {activities.length > 0 && (
                <span
                  style={{
                    marginLeft: "0.5rem",
                    fontSize: "0.8125rem",
                    fontWeight: 400,
                    color: "var(--color-sumi500)",
                  }}
                >
                  （{activities.length} 件）
                </span>
              )}
            </h2>
            <p style={{ ...styles.helpText, marginBottom: "0.75rem" }}>
              社内担当者による対応記録（架電・メール等）です。顧客側の行動ログは「顧客行動」タブをご確認ください。
            </p>

            {activities.length === 0 ? (
              <div
                style={{
                  ...styles.card,
                  textAlign: "center",
                  color: "var(--color-sumi500)",
                  padding: "2rem 1.5rem",
                }}
              >
                アクティビティがありません
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "var(--radius-card)",
                  boxShadow: "var(--elevation-low)",
                  overflow: "hidden",
                }}
              >
                {activities.map((act) => (
                  <ActivityAccordionItem
                    key={act.id}
                    act={act}
                    isAdmin={isAdmin}
                    canEdit={
                      act.caller?.id === currentUser.id ||
                      act.caller_user_id === currentUser.id ||
                      isManagerOrAbove
                    }
                    deletingActId={deletingActId}
                    onDelete={handleDeleteActivity}
                    onEdit={setEditingAct}
                  />
                ))}
              </div>
            )}

            {actError && (
              <p style={{ ...styles.error, marginTop: "0.75rem" }}>{actError}</p>
            )}
          </div>

          {/* 右カラム: 新規追加フォーム（sticky） */}
          <div
            style={{
              position: "sticky",
              top: "1rem",
            }}
          >
            <DetailSection title="社内対応を追加" icon={Plus}>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {/* 対応日 */}
                <div>
                  <label style={styles.label} htmlFor="add-act-called-on">対応日 *</label>
                  <input
                    id="add-act-called-on"
                    type="date"
                    style={styles.input}
                    value={actForm.called_on}
                    onChange={(e) => setAct("called_on", e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {/* 対応時刻 */}
                <div>
                  <label style={styles.label} htmlFor="add-act-called-at-time">対応時刻</label>
                  <input
                    id="add-act-called-at-time"
                    type="time"
                    style={styles.input}
                    value={actForm.called_at_time}
                    onChange={(e) => setAct("called_at_time", e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>

                {/* 対応種別 */}
                <div>
                  <label style={styles.label} htmlFor="add-act-activity-type">対応種別</label>
                  <select
                    id="add-act-activity-type"
                    style={styles.input}
                    value={actForm.activity_type_id}
                    onChange={(e) => setAct("activity_type_id", e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">-- 未選択 --</option>
                    {masters.activityTypes.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 対応ステータス */}
                <div>
                  <label style={styles.label} htmlFor="add-act-call-status">対応ステータス *</label>
                  <select
                    id="add-act-call-status"
                    style={styles.input}
                    value={actForm.call_status_id}
                    onChange={(e) => setAct("call_status_id", e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">-- 選択 --</option>
                    {masters.callStatuses.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 対応者 */}
                <div>
                  <label style={styles.label} htmlFor="add-act-caller">対応者 *</label>
                  <select
                    id="add-act-caller"
                    style={styles.input}
                    value={actForm.caller_user_id}
                    onChange={(e) => setAct("caller_user_id", e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">-- 選択 --</option>
                    {masters.owners.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* メモ */}
                <div>
                  <label style={styles.label} htmlFor="add-act-note">メモ</label>
                  <textarea
                    id="add-act-note"
                    rows={3}
                    style={{ ...styles.input, resize: "vertical" }}
                    value={actForm.note}
                    onChange={(e) => setAct("note", e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  />
                </div>
              </div>

              {actError && <p style={styles.error}>{actError}</p>}

              <button
                style={{ ...styles.btnPrimary, marginTop: "1rem", width: "100%", justifyContent: "center" }}
                onClick={handleAddActivity}
                disabled={actSaving}
              >
                <ClipboardList size={14} />
                {actSaving ? "追加中..." : "追加する"}
              </button>
            </DetailSection>
          </div>
        </div>
      )}

      {/* 社内対応 編集モーダル（タブ外に配置してポータル相当の重ね合わせを確保） */}
      {editingAct && (
        <LeadActivityEditModal
          act={editingAct}
          masters={masters}
          onClose={() => setEditingAct(null)}
          onSaved={(updated) => {
            handleEditActivitySaved(updated);
            setEditingAct(null);
          }}
        />
      )}

      {/* === キャンペーンタブ（参照のみ）=== */}
      {activeTab === "campaigns" && (
        <div>
          {attachedCampaigns.length === 0 ? (
            <div
              style={{
                ...styles.card,
                textAlign: "center",
                color: "var(--color-sumi500)",
              }}
            >
              <p style={{ margin: 0 }}>キャンペーンは紐付いていません</p>
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.75rem" }}>
                キャンペーンへの紐付けはキャンペーン詳細画面から行ってください
              </p>
            </div>
          ) : (
            <DetailSection
              icon={Megaphone}
              title={`紐付きキャンペーン（${attachedCampaigns.length} 件）`}
            >
              <div
                style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
              >
                {attachedCampaigns.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                  >
                    <Link
                      href={`/campaigns/${c.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        color: "var(--color-terra)",
                        textDecoration: "none",
                        fontSize: "0.875rem",
                      }}
                    >
                      {c.name}
                      <ArrowUpRight size={13} />
                    </Link>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
        </div>
      )}

      {/* レスポンシブ: モバイルは縦積み */}
      <style>{`
        @media (max-width: 640px) {
          .activities-layout {
            grid-template-columns: 1fr !important;
          }
        }

        /* ── 顧客行動ログ: デスクトップはグリッド, モバイル(768px以下)はカード ── */
        .customer-activity-row {
          display: grid;
          grid-template-columns: 140px 120px 1fr 120px 60px;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--color-border-default);
          align-items: center;
          font-size: 0.875rem;
        }
        @media (max-width: 768px) {
          /* グリッドラッパーは非表示にして代わりにカードを表示 */
          .customer-activity-grid-wrapper {
            display: none !important;
          }
          .customer-activity-cards {
            display: flex !important;
            flex-direction: column;
            gap: 0.75rem;
          }
          .customer-activity-card {
            background-color: var(--color-surface, #fff);
            border: 1px solid var(--color-border-default);
            border-radius: var(--radius-card);
            padding: 0.75rem;
          }
          .customer-activity-card-top {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.375rem;
            flex-wrap: wrap;
          }
          .customer-activity-card-middle {
            font-size: 0.875rem;
            color: var(--color-text-body);
            margin-bottom: 0.375rem;
            word-break: break-all;
          }
          .customer-activity-card-bottom {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
          }
        }
        @media (min-width: 769px) {
          .customer-activity-cards {
            display: none !important;
          }
          .customer-activity-grid-wrapper {
            display: block !important;
          }
        }

        /* ── スコア内訳リスト: デスクトップはグリッド, モバイル(768px以下)はカード ── */
        .score-breakdown-row {
          display: grid;
          grid-template-columns: 100px 1fr 70px 120px;
          gap: 0.5rem;
          padding: 0.625rem 0;
          align-items: center;
        }
        /* デスクトップ: モバイル用カード内レイアウトは非表示 */
        .score-breakdown-row-inner {
          display: none;
        }
        .score-breakdown-total-row {
          display: grid;
          grid-template-columns: 100px 1fr 70px 120px;
          gap: 0.5rem;
          padding: 0.625rem 0;
          border-top: 2px solid var(--color-border-default);
          align-items: center;
        }
        @media (max-width: 768px) {
          .score-breakdown-row {
            display: block !important;
            padding: 0.375rem 0;
          }
          /* モバイル: グリッド列セルを隠してカード内レイアウトを表示 */
          .score-breakdown-row .score-breakdown-col-category { display: none; }
          .score-breakdown-row .score-breakdown-col-desc { display: none; }
          .score-breakdown-row .score-breakdown-col-delta { display: none; }
          .score-breakdown-row .score-breakdown-col-date { display: none; }
          .score-breakdown-row-inner {
            display: flex !important;
            flex-direction: column;
            gap: 0.25rem;
            background-color: var(--color-sumi50, #F8F8FB);
            border: 1px solid var(--color-border-default);
            border-radius: var(--radius-card);
            padding: 0.625rem 0.75rem;
          }
          .score-breakdown-row-top {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
          }
          .score-breakdown-row-desc {
            font-size: 0.875rem;
            color: var(--color-text-body);
            word-break: break-all;
          }
          .score-breakdown-row-bottom {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
          }
          .score-breakdown-total-row {
            grid-template-columns: 1fr 70px !important;
          }
          .score-breakdown-total-row .score-breakdown-total-empty { display: none !important; }
          .score-breakdown-total-row .score-breakdown-total-date { display: none !important; }
        }
      `}</style>
    </div>
  );
}

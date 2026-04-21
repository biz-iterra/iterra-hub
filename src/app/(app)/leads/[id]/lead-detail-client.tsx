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
} from "lucide-react";
import { createLeadActivity, deleteLeadActivity } from "@/actions/lead-activities";

type Tab = "basic" | "activities" | "campaigns";
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
  callers: SelectOption[];
  callStatuses: SelectOption[];
  largeSegments: SelectOption[];
  smallSegments: SmallSegmentOption[];
  owners: SelectOption[];
  categories: SelectOption[];
  activityTypes: ActivityTypeOption[];
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

function TemperatureBadge({ code, name }: { code: string; name: string }) {
  const colMap: Record<string, React.CSSProperties> = {
    hot: { backgroundColor: "rgba(215, 119, 93, 0.15)", color: "#A34E35" },
    warm: { backgroundColor: "rgba(229, 196, 127, 0.25)", color: "#8A6D1E" },
    cold: { backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#1E40AF" },
  };
  const s =
    colMap[code] ?? {
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi700)",
    };
  return (
    <span
      style={{
        ...s,
        borderRadius: "var(--radius-badge)",
        padding: "0.125rem 0.5rem",
        fontSize: "0.75rem",
        fontWeight: 500,
      }}
    >
      {name}
    </span>
  );
}

function ActivityTypeBadge({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      style={{
        backgroundColor: color ? `${color}26` : "var(--color-sumi100)",
        color: color ?? "var(--color-sumi700)",
        borderRadius: "var(--radius-badge)",
        padding: "0.125rem 0.5rem",
        fontSize: "0.75rem",
        fontWeight: 500,
      }}
    >
      {name}
    </span>
  );
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

/** アコーディオン行 */
function ActivityAccordionItem({
  act,
  isAdmin,
  deletingActId,
  onDelete,
}: {
  act: any;
  isAdmin: boolean;
  deletingActId: string | null;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--color-border-default)",
      }}
    >
      {/* サマリ行（常時表示） */}
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
          {/* 日付 */}
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

          {/* 対応種別バッジ */}
          {act.activity_type?.name && (
            <ActivityTypeBadge
              name={act.activity_type.name}
              color={act.activity_type.color ?? null}
            />
          )}

          {/* 対応ステータス */}
          {act.call_status?.name && (
            <span
              style={{
                backgroundColor: "var(--color-sumi100)",
                color: "var(--color-text-body)",
                borderRadius: "var(--radius-badge)",
                padding: "0.125rem 0.5rem",
                fontSize: "0.75rem",
              }}
            >
              {act.call_status.name}
            </span>
          )}

          {/* 対応者 */}
          {act.caller?.name && (
            <span
              style={{
                color: "var(--color-sumi600)",
                fontSize: "0.75rem",
              }}
            >
              {act.caller.name}
            </span>
          )}
        </div>

        {/* 開閉アイコン */}
        <span style={{ color: "var(--color-sumi500)", flexShrink: 0 }}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {/* 詳細（展開時） */}
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

          {isAdmin && (
            <button
              onClick={() => onDelete(act.id)}
              disabled={deletingActId === act.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                color: "#DC2626",
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
      )}
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
  lead: any;
  activities: any[];
  masters: Masters;
  currentUser: { id: string; full_name: string; role: string };
  initialLeadCampaigns?: CampaignRef[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("basic");

  const isAdmin = currentUser.role === "admin";
  const isManagerOrAbove =
    currentUser.role === "manager" || currentUser.role === "admin";
  const isOwnerOrAbove =
    isManagerOrAbove || lead.owner_user_id === currentUser.id;

  const promotedDealId: string | null = lead.promoted_deal_id ?? null;

  // ---- アクティビティ ----
  const [activities, setActivities] = useState(initialActivities);
  const [actForm, setActForm] = useState({
    called_on: new Date().toISOString().slice(0, 10),
    called_at_time: "",
    call_status_id: "",
    caller_id: "",
    activity_type_id: "",
    note: "",
  });
  const [actError, setActError] = useState<string | null>(null);
  const [actSaving, setActSaving] = useState(false);
  const [deletingActId, setDeletingActId] = useState<string | null>(null);

  const setAct = <K extends keyof typeof actForm>(
    key: K,
    value: (typeof actForm)[K]
  ) => {
    setActForm((v) => ({ ...v, [key]: value }));
  };

  const handleAddActivity = async () => {
    if (!actForm.call_status_id || !actForm.caller_id) {
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
      caller_id: actForm.caller_id,
      activity_type_id: actForm.activity_type_id || null,
      note: actForm.note || null,
    });
    setActSaving(false);
    if (result.error) {
      setActError(result.error);
      return;
    }
    setActivities((prev) => [result.data, ...prev]);
    setActForm({
      called_on: new Date().toISOString().slice(0, 10),
      called_at_time: "",
      call_status_id: "",
      caller_id: "",
      activity_type_id: "",
      note: "",
    });
  };

  const handleDeleteActivity = async (actId: string) => {
    setDeletingActId(actId);
    const result = await deleteLeadActivity(actId);
    setDeletingActId(null);
    if (result.error) {
      setActError(result.error);
      return;
    }
    setActivities((prev) => prev.filter((a) => a.id !== actId));
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

  return (
    <div style={{ padding: "1.5rem", maxWidth: 960, margin: "0 auto" }}>
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
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {lead.stage?.name && (
              <span
                style={{
                  backgroundColor: "rgba(122,165,146,0.15)",
                  color: "#4D7A65",
                  borderRadius: "var(--radius-badge)",
                  padding: "0.125rem 0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}
              >
                {lead.stage.name}
              </span>
            )}
            {lead.status?.name && (
              <span
                style={{
                  backgroundColor: "var(--color-sumi100)",
                  color: "var(--color-text-body)",
                  borderRadius: "var(--radius-badge)",
                  padding: "0.125rem 0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}
              >
                {lead.status.name}
              </span>
            )}
            {lead.category?.name && (
              <span
                style={{
                  backgroundColor: lead.category.color
                    ? `${lead.category.color}26`
                    : "var(--color-sumi100)",
                  color: lead.category.color ?? "var(--color-sumi700)",
                  borderRadius: "var(--radius-badge)",
                  padding: "0.125rem 0.5rem",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                }}
              >
                {lead.category.name}
              </span>
            )}
            {lead.temperature && (
              <TemperatureBadge
                code={lead.temperature.code}
                name={lead.temperature.name}
              />
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
                Deal 昇格済み
                <ArrowUpRight size={12} />
              </Link>
            )}
          </div>
        </div>
        {/* 編集ボタン（オーナー以上） */}
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
        }}
      >
        {(
          [
            { key: "basic", label: "基本情報", icon: FileText },
            { key: "activities", label: "アクティビティ", icon: ClipboardList },
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
        <div>
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
                <Field label="リード名" value={lead.lead_name} />
              </div>
              <Field
                label="事業者種別"
                value={lead.account_type?.name ?? findLabel(masters.accountTypes, lead.account_type_id)}
              />
              <Field label="企業名（仮）" value={lead.company_name} />
              <Field label="電話番号" value={lead.phone} />
              <Field label="URL" value={lead.url} />
              <Field
                label="流入元"
                value={lead.lead_source?.name ?? findLabel(masters.sources, lead.lead_source_id)}
              />
              <Field
                label="担当者"
                value={lead.owner?.full_name ?? findLabel(masters.owners, lead.owner_user_id)}
              />
            </div>
          </div>

          {/* ステージ・ステータス */}
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
              <Field label="ステージ" value={lead.stage?.name ?? findLabel(masters.stages, lead.stage_id)} />
              <Field label="ステータス" value={lead.status?.name ?? findLabel(masters.statuses, lead.status_id)} />
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
              <Field
                label="カテゴリ"
                value={lead.category?.name ?? findLabel(masters.categories, lead.category_id)}
              />
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
              <Field
                label="スコア（0-100）"
                value={lead.score != null ? String(lead.score) : null}
              />
              <div>
                <span style={styles.label}>温度感</span>
                {lead.temperature ? (
                  <div style={{ marginTop: "0.125rem" }}>
                    <TemperatureBadge
                      code={lead.temperature.code}
                      name={lead.temperature.name}
                    />
                  </div>
                ) : (
                  <p style={{ margin: 0, ...styles.valueEmpty }}>—</p>
                )}
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
              <Field
                label="主担当"
                value={lead.primary_caller?.name ?? findLabel(masters.callers, lead.primary_caller_id)}
              />
              <Field
                label="大分類セグメント"
                value={lead.large_segment?.name ?? findLabel(masters.largeSegments, lead.large_segment_id)}
              />
              <Field
                label="小分類セグメント"
                value={lead.small_segment?.name ?? findLabel(masters.smallSegments, lead.small_segment_id)}
              />
            </div>
          </div>
        </div>
      )}

      {/* === アクティビティタブ === */}
      {activeTab === "activities" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 7fr) minmax(260px, 3fr)",
            gap: "1.5rem",
            alignItems: "start",
          }}
          className="activities-layout"
        >
          {/* 左カラム: アクティビティ一覧（アコーディオン） */}
          <div>
            <h2
              style={{
                color: "var(--color-text-title)",
                fontSize: "1rem",
                fontWeight: 600,
                margin: "0 0 0.75rem 0",
              }}
            >
              アクティビティ
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
                {activities.map((act: any) => (
                  <ActivityAccordionItem
                    key={act.id}
                    act={act}
                    isAdmin={isAdmin}
                    deletingActId={deletingActId}
                    onDelete={handleDeleteActivity}
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
            <div style={styles.card}>
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  margin: "0 0 1rem 0",
                }}
              >
                アクティビティを追加
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {/* 対応日 */}
                <div>
                  <label style={styles.label}>対応日 *</label>
                  <input
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
                  <label style={styles.label}>対応時刻</label>
                  <input
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
                  <label style={styles.label}>対応種別</label>
                  <select
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
                  <label style={styles.label}>対応ステータス *</label>
                  <select
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
                  <label style={styles.label}>対応者 *</label>
                  <select
                    style={styles.input}
                    value={actForm.caller_id}
                    onChange={(e) => setAct("caller_id", e.target.value)}
                    onFocus={onFocus}
                    onBlur={onBlur}
                  >
                    <option value="">-- 選択 --</option>
                    {masters.callers.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* メモ */}
                <div>
                  <label style={styles.label}>メモ</label>
                  <textarea
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
            </div>
          </div>
        </div>
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
            <div style={styles.card}>
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  margin: "0 0 1rem 0",
                }}
              >
                紐付きキャンペーン（{attachedCampaigns.length} 件）
              </h2>
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
            </div>
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
      `}</style>
    </div>
  );
}

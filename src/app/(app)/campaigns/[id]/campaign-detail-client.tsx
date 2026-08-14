"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Users,
  FileText,
  X,
  Plus,
  ArrowUpRight,
  Search,
  Megaphone,
  UserSearch,
} from "lucide-react";
import {
  attachLeadsToCampaign,
  detachLeadFromCampaign,
  getUnassignedLeadsForCampaign,
} from "@/actions/campaigns";
import {
  CampaignTypeBadge,
  CampaignStatusBadge,
  StageBadge,
  StatusBadge,
  TemperatureBadge,
  CategoryBadge,
} from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type {
  CampaignLeadRow,
  Row,
  UnassignedLeadRow,
} from "@/types/relations";
import { detailContainerClass, fieldGridClass, tableScrollClass } from "@/lib/layout";
import { useSearchField } from "@/hooks/useSearchField";
import { useScrollLock } from "@/hooks/useScrollLock";

type Tab = "basic" | "leads";

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
    margin: 0,
  } as CSSProperties,
  valueEmpty: {
    fontSize: "0.875rem",
    color: "var(--color-sumi400)",
    lineHeight: 1.5,
    margin: 0,
  } as CSSProperties,
  grid2: fieldGridClass,
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
  error: { color: "var(--color-error)", fontSize: "0.875rem", margin: "0.75rem 0 0 0" } as CSSProperties,
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
};

function onFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

// ---------- リード紐付けモーダル ----------
//
// 候補はサーバー側で検索・ページネーションする（getUnassignedLeadsForCampaign）。
// 選択は id ではなく行オブジェクトの Map で保持する。ページをまたいで選択しても
// 紐付け完了時に onAttached へ渡す行データ（一覧の楽観更新用）を失わないため。
function AttachLeadsModal({
  campaignId,
  onAttached,
  onClose,
}: {
  campaignId: string;
  onAttached: (leads: UnassignedLeadRow[]) => void;
  onClose: () => void;
}) {
  // 開いている間は背面を止める（T-0091）
  useScrollLock(true);
  const [search, setSearch] = useState("");
  /*
   * 表示は draft、検索に使うのは search。
   * **変換中は search を更新しない**（未確定の文字で候補が入れ替わる）。
   * 検索の待ち時間は下のエフェクトが持つので、確定したら即座に渡す。
   */
  const {
    draft: searchDraft,
    handleChange: onSearchChange,
    handleCompositionStart: onSearchCompositionStart,
    handleCompositionEnd: onSearchCompositionEnd,
  } = useSearchField({ value: search, onChange: setSearch, debounceMs: 0 });
  const [rows, setRows] = useState<UnassignedLeadRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedLeads, setSelectedLeads] = useState<Map<string, UnassignedLeadRow>>(new Map());
  const [saving, setSaving] = useState(false);
  const [isLoading, startTransition] = useTransition();
  const { showToast } = useToast();

  const fetchCandidates = useCallback(
    (nextParams: { keyword: string; page: number }) => {
      startTransition(async () => {
        const { data } = await getUnassignedLeadsForCampaign(campaignId, {
          keyword: nextParams.keyword || undefined,
          page: nextParams.page,
          perPage: DEFAULT_PAGE_SIZE,
        });
        if (data) {
          setRows(data.rows);
          setTotalCount(data.total);
        }
      });
    },
    [campaignId]
  );

  // 初回は即座に読み込み、以降の検索キーワード変更はデバウンスして 1 ページ目から検索し直す
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      fetchCandidates({ keyword: "", page: 1 });
      return;
    }
    const timer = setTimeout(() => {
      setPage(1);
      fetchCandidates({ keyword: search, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ページ変更
  useEffect(() => {
    if (page > 1) fetchCandidates({ keyword: search, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const toggleLead = (lead: UnassignedLeadRow) => {
    setSelectedLeads((prev) => {
      const next = new Map(prev);
      if (next.has(lead.id)) next.delete(lead.id);
      else next.set(lead.id, lead);
      return next;
    });
  };

  const handleAttach = async () => {
    if (selectedLeads.size === 0) return;
    setSaving(true);
    const attached = Array.from(selectedLeads.values());
    const result = await attachLeadsToCampaign({
      campaignId,
      leadIds: attached.map((l) => l.id),
    });
    setSaving(false);
    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    onAttached(attached);
    onClose();
    showToast({ type: "success", message: `リードを${attached.length}件紐付けました` });
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
  const titleId = useId();
  const modalStyle: CSSProperties = {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-modal)",
    boxShadow: "var(--elevation-overlay)",
    maxWidth: 560,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    maxHeight: "80vh",
  };

  return (
    <div style={overlayStyle} onClick={saving ? undefined : onClose}>
      {/* 支援技術にモーダルだと伝える。**これが無いと E2E も入力欄を位置でしか
          指定できない**（T-0048。マスタ管理と同じ欠落がここにも残っていた） */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--color-border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              color: "var(--color-text-title)",
              fontSize: "1rem",
              fontWeight: 600,
              margin: 0,
            }}
            id={titleId}
          >
            リードを追加
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--color-sumi500)",
              padding: "0.25rem",
              borderRadius: "var(--radius-sm)",
              display: "inline-flex",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--color-border-default)" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: "0.625rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-sumi500)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="リード名・会社名で検索..."
              value={searchDraft}
              onChange={onSearchChange}
              onCompositionStart={onSearchCompositionStart}
              onCompositionEnd={onSearchCompositionEnd}
              onFocus={onFocus}
              onBlur={onBlur}
              style={{ ...styles.input, paddingLeft: "2rem" }}
            />
          </div>
          {isLoading && (
            <p style={{ fontSize: "0.75rem", color: "var(--color-sumi500)", margin: "0.375rem 0 0 0" }}>
              読み込み中...
            </p>
          )}
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {rows.length === 0 ? (
            <p
              style={{
                textAlign: "center",
                color: "var(--color-sumi500)",
                fontSize: "0.875rem",
                padding: "2rem 1.5rem",
                margin: 0,
              }}
            >
              {isLoading ? "読み込み中..." : search ? "検索結果がありません" : "紐付け可能なリードがありません"}
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {rows.map((lead) => {
                const checked = selectedLeads.has(lead.id);
                return (
                  <li
                    key={lead.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.625rem 1.5rem",
                        cursor: "pointer",
                        backgroundColor: checked ? "rgba(122,165,146,0.06)" : "transparent",
                        transition: "background-color 0.1s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleLead(lead)}
                        style={{ accentColor: "var(--color-terra)", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
                      />
                      <span
                        style={{
                          fontSize: "0.875rem",
                          color: "var(--color-text-body)",
                          fontWeight: 500,
                          flex: 1,
                        }}
                      >
                        {lead.lead_name}
                        {lead.company_name && (
                          <span
                            style={{
                              marginLeft: "0.375rem",
                              fontSize: "0.75rem",
                              color: "var(--color-sumi500)",
                              fontWeight: 400,
                            }}
                          >
                            ({lead.company_name})
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
                        {lead.category?.name && (
                          <CategoryBadge name={lead.category.name} color={lead.category.color} />
                        )}
                        {lead.temperature && (
                          <TemperatureBadge code={lead.temperature.code} name={lead.temperature.name} color={lead.temperature.color} />
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ページネーション（30 件超で表示） */}
        {totalCount > DEFAULT_PAGE_SIZE && (
          <div style={{ padding: "0.75rem 1.5rem", borderTop: "1px solid var(--color-border-default)" }}>
            <Pagination
              page={page}
              totalCount={totalCount}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid var(--color-border-default)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--color-sumi600)" }}>
            {selectedLeads.size > 0 ? `${selectedLeads.size} 件選択中` : "チェックして選択"}
          </span>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" style={styles.btnOutline} onClick={onClose} disabled={saving}>
              キャンセル
            </button>
            <button
              type="button"
              style={styles.btnPrimary}
              onClick={handleAttach}
              disabled={selectedLeads.size === 0 || saving}
            >
              {saving ? "追加中..." : `選択したリードを紐付け（${selectedLeads.size}件）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- メインコンポーネント ----------
export function CampaignDetailClient({
  campaign,
  campaignLeads: initialCampaignLeads,
  initialUnassignedTotal,
  currentUser,
}: {
  campaign: Row<"campaigns">;
  campaignLeads: CampaignLeadRow[];
  /** 未紐付け候補の総数（ページ1件目取得時点）。「追加」ボタンの活性判定にのみ使う */
  initialUnassignedTotal: number;
  currentUser: { id: string; full_name: string; role: string };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("basic");
  const [, startTransition] = useTransition();

  const isManagerOrAbove =
    currentUser.role === "manager" || currentUser.role === "admin";

  // ---- リード管理 ----
  const [campaignLeads, setCampaignLeads] = useState(initialCampaignLeads);
  // モーダル自身がサーバーから検索・ページネーションして候補を取得するため、
  // ここでは「追加」ボタンを活性化するかどうかの目安の総数だけを持つ
  const [unassignedTotal, setUnassignedTotal] = useState(initialUnassignedTotal);
  const [showModal, setShowModal] = useState(false);

  const handleLeadsAttached = (attachedLeads: UnassignedLeadRow[]) => {
    // 紐付け済み一覧に追加
    // ステージ・ステータス・担当者の名称は未取得のため null。
    // 次のサーバー再取得で埋まる。
    const newRows: CampaignLeadRow[] = attachedLeads.map((l) => ({
      lead: {
        id: l.id,
        lead_name: l.lead_name,
        company_name: l.company_name,
        stage_id: l.stage_id,
        status_id: l.status_id,
        score: l.score,
        temperature_id: l.temperature_id,
        owner_user_id: l.owner_user_id,
        stage: null,
        status: null,
        temperature: l.temperature,
        owner: null,
      },
      assigned_at: new Date().toISOString(),
    }));
    setCampaignLeads((prev) => [...newRows, ...prev]);
    setUnassignedTotal((prev) => Math.max(prev - attachedLeads.length, 0));
  };

  const handleDetachLead = (leadId: string) => {
    startTransition(async () => {
      const result = await detachLeadFromCampaign(leadId, campaign.id);
      if (result.error) {
        showToast({ type: "error", message: result.error });
        return;
      }
      // 解除されたリードを紐付け一覧から削除し、未紐付けへは戻さない（ページリロードで解決）
      setCampaignLeads((prev) => prev.filter((cl) => cl.lead?.id !== leadId));
      showToast({ type: "success", message: "リードの紐付けを解除しました" });
      router.refresh();
    });
  };

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

  return (
    <div className={detailContainerClass}>
      {/* モーダル */}
      {showModal && (
        <AttachLeadsModal
          campaignId={campaign.id}
          onAttached={handleLeadsAttached}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Back */}
      <Link
        href="/campaigns"
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
        キャンペーン一覧
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 style={{ color: "var(--color-text-title)", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {campaign.name}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <CampaignTypeBadge type={campaign.type} />
            <CampaignStatusBadge status={campaign.status} />
          </div>
        </div>
        {/* 編集ボタン（manager 以上） */}
        {isManagerOrAbove && (
          <Link
            href={`/campaigns/${campaign.id}/edit`}
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
      <div style={{ borderBottom: "1px solid var(--color-border-default)", marginBottom: "1.5rem", display: "flex" }}>
        {(
          [
            { key: "basic", label: "基本情報", icon: FileText },
            { key: "leads", label: "リード", icon: Users },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              ...tabBase,
              color: activeTab === key ? "var(--color-terra)" : "var(--color-sumi600)",
              borderBottomColor: activeTab === key ? "var(--color-terra)" : "transparent",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
              <Icon size={15} />
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* === 基本情報タブ（閲覧専用）=== */}
      {activeTab === "basic" && (
        <div>
          <DetailSection title="基本情報" icon={Megaphone}>
            <div className={styles.grid2}>
              <InfoField label="キャンペーン名" value={campaign.name} full />
              <InfoField
                label="種別"
                value={<CampaignTypeBadge type={campaign.type} />}
              />
              <InfoField
                label="ステータス"
                value={<CampaignStatusBadge status={campaign.status} />}
              />
              <InfoField
                label="開始日"
                value={
                  campaign.start_date
                    ? new Date(campaign.start_date).toLocaleDateString("ja-JP")
                    : null
                }
              />
              <InfoField
                label="終了日"
                value={
                  campaign.end_date
                    ? new Date(campaign.end_date).toLocaleDateString("ja-JP")
                    : null
                }
              />
              <InfoField label="説明" value={campaign.description} full />
            </div>
          </DetailSection>
        </div>
      )}

      {/* === リードタブ === */}
      {activeTab === "leads" && (
        <div>
          {/* リード追加ボタン（manager 以上）*/}
          {isManagerOrAbove && (
            <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                style={styles.btnPrimary}
                onClick={() => setShowModal(true)}
                disabled={unassignedTotal === 0}
              >
                <Plus size={14} />
                リードを追加
              </button>
            </div>
          )}

          {/* リード一覧 */}
          {campaignLeads.length === 0 ? (
            <div style={{ ...styles.card, textAlign: "center", color: "var(--color-sumi500)" }}>
              紐付いているリードはありません
            </div>
          ) : (
            <DetailSection
              title={`紐付きリード（${campaignLeads.length} 件）`}
              icon={UserSearch}
            >
              <div
                className={tableScrollClass}
                style={{ borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-default)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
                      {["リード名", "ステージ", "ステータス", "温度感", "担当者", "追加日", ...(isManagerOrAbove ? ["操作"] : [])].map((h) => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-semibold" style={{ color: "var(--color-sumi600)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaignLeads.map((cl) => {
                      const lead = cl.lead;
                      if (!lead) return null;
                      return (
                        <tr
                          key={lead.id}
                          style={{ borderBottom: "1px solid var(--color-border-default)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <td className="px-4 py-2">
                            <Link
                              href={`/leads/${lead.id}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                                color: "var(--color-terra)",
                                textDecoration: "none",
                                fontSize: "0.875rem",
                              }}
                            >
                              {lead.lead_name}
                              <ArrowUpRight size={12} />
                            </Link>
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <StageBadge name={lead.stage?.name} color={lead.stage?.color} sortOrder={lead.stage?.sort_order} />
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            <StatusBadge name={lead.status?.name} color={lead.status?.color} sortOrder={lead.status?.sort_order} />
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {lead.temperature
                              ? <TemperatureBadge code={lead.temperature.code} name={lead.temperature.name} color={lead.temperature.color} />
                              : <span style={{ color: "var(--color-sumi400)" }}>—</span>
                            }
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap" style={{ color: "var(--color-sumi600)" }}>
                            {lead.owner?.full_name ?? "—"}
                          </td>
                          <td className="px-4 py-2 text-xs whitespace-nowrap" style={{ color: "var(--color-sumi500)" }}>
                            {cl.assigned_at ? new Date(cl.assigned_at).toLocaleDateString("ja-JP") : "—"}
                          </td>
                          {isManagerOrAbove && (
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => handleDetachLead(lead.id)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                  color: "var(--color-sumi500)",
                                  backgroundColor: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                }}
                              >
                                <X size={12} />解除
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </DetailSection>
          )}
        </div>
      )}
    </div>
  );
}

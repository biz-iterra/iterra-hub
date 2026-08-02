"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { CompanyVerificationPanel } from "./company-verification-panel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  getPipelineTypes, createPipelineType, updatePipelineType, deletePipelineType,
  getDealStages, createDealStage, updateDealStage, deleteDealStage,
  getDealStatuses, createDealStatus, updateDealStatus, deleteDealStatus,
  getContractTypes, createContractTypeAction, updateContractType, deleteContractType,
  getCorporateTypes, createCorporateType, updateCorporateType, deleteCorporateType,
  getServices, createService, updateService, deleteService,
  getLeadSources, createLeadSource, updateLeadSource, deleteLeadSource,
  getAccountTypes, createAccountTypeAction, updateAccountType, deleteAccountType,
  getAccountRoleTypesMaster, createAccountRoleType, updateAccountRoleType, deleteAccountRoleType,
  getAccountStatuses, createAccountStatusAction, updateAccountStatus, deleteAccountStatus,
  getContactStatuses, createContactStatusAction, updateContactStatus, deleteContactStatus,
  getCompanyStatuses, createCompanyStatusAction, updateCompanyStatus, deleteCompanyStatus,
  getProjectStatusesMasters, createProjectStatus, updateProjectStatus, deleteProjectStatus,
  getSkillCategories, createSkillCategory, updateSkillCategory, deleteSkillCategory,
  getSkills, createSkill, updateSkill, deleteSkill,
  getLeadCategories, createLeadCategory, updateLeadCategory, deleteLeadCategory,
  getLeadActivityTypes, createLeadActivityType, updateLeadActivityType, deleteLeadActivityType,
  getLeadStages, createLeadStage, updateLeadStage, deleteLeadStage,
  getLeadStatuses, createLeadStatus, updateLeadStatus, deleteLeadStatus,
  getLeadTemperatures, createLeadTemperature, updateLeadTemperature, deleteLeadTemperature,
  getLeadCallStatuses, createLeadCallStatus, updateLeadCallStatus, deleteLeadCallStatus,
  getLeadLargeSegments, createLeadLargeSegment, updateLeadLargeSegment, deleteLeadLargeSegment,
  getLeadSmallSegments, createLeadSmallSegment, updateLeadSmallSegment, deleteLeadSmallSegment,
  getLeadCompanySizes, createLeadCompanySize, updateLeadCompanySize, deleteLeadCompanySize,
  getLeadCustomerActivityTypes, createLeadCustomerActivityType, updateLeadCustomerActivityType, deleteLeadCustomerActivityType,
  getLeadScoreRulesWithBrokenRefs, createLeadScoreRule, updateLeadScoreRule, deleteLeadScoreRule,
  getLeadScoreThresholds,
} from "@/actions/masters";
import type { LeadScoreRuleWithRefCheck, Row } from "@/types/relations";

/** スコアリング管理タブで扱うマスタ行 */
type LeadScoreRule = LeadScoreRuleWithRefCheck;
type LeadScoreThreshold = Row<"lead_score_thresholds">;

// ===== Types =====

type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select";
  options?: { value: string; label: string }[];
  colorSwatch?: boolean;
  min?: number;
  width?: string;
  /** number 型で NULL を許容するか（空欄=NULL）。未指定の number は従来どおり空欄不可・既定値 0 */
  nullable?: boolean;
  /** 入力欄の下に表示する補足説明（number/text 系で使用） */
  helpText?: string;
  /** 一覧テーブルで値が NULL のときの表示文言（未指定なら "-"） */
  emptyDisplay?: string;
  /** 一覧テーブルで値がある場合に末尾へ付与する単位表記（例: "ヶ月後"） */
  unit?: string;
};

// 一覧テーブルのカラム幅をフィールド内容に応じて算出
function resolveFieldWidth(f: FieldDef): string {
  if (f.width) return f.width;
  if (f.colorSwatch) return "140px";
  if (f.type === "number") return "90px";
  if (f.type === "textarea") return "auto"; // 定義等の長文は残り幅を吸収
  if (f.type === "select") return "200px";
  // text 系: slug / code は短め、name はやや広め、それ以外は既定値
  if (/(^|_)(slug|code)$/.test(f.key)) return "140px";
  if (f.key === "name") return "220px";
  return "180px";
}

type MasterItem = Record<string, unknown> & { id: string; name: string };

// ===== Tab & Group definitions =====

// TabKey の型導出にのみ使う（値として参照しないのは意図的）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TAB_KEYS = [
  // 共通・取引
  "pipeline", "contract_types", "services",
  // 事業者情報
  "corporate_types", "company_statuses", "company_verification",
  // 取引先（種別 = 事業体の形態、区分 = 取引上の役割。軸が違うので別マスタ）
  "account_types", "account_role_types", "account_statuses",
  // 連絡先
  "contact_statuses",
  // リード・マーケティング（lead_statuses は lead_stages タブ内で管理、lead_small_segments は lead_large_segments タブ内で管理）
  "lead_sources", "lead_categories", "lead_stages",
  "lead_temperatures", "lead_call_statuses",
  "lead_large_segments", "lead_activity_types",
  // スコアリング（Phase 7）
  "lead_company_sizes", "lead_customer_activity_types", "lead_score_rules", "lead_score_thresholds",
  // プロジェクト
  "project_statuses",
  // タレント
  "skills",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  pipeline: "パイプライン",
  contract_types: "契約種別",
  services: "サービス",
  corporate_types: "法人格",
  company_statuses: "事業者情報ステータス",
  company_verification: "実在確認",
  account_types: "取引先種別",
  account_role_types: "取引先区分",
  account_statuses: "取引先ステータス",
  contact_statuses: "連絡先ステータス",
  lead_sources: "リードソース",
  lead_categories: "リードカテゴリ",
  lead_stages: "ステージ・ステータス",
  lead_temperatures: "温度感",
  lead_call_statuses: "コールステータス",
  lead_large_segments: "セグメント",
  lead_activity_types: "対応種別",
  lead_company_sizes: "企業規模",
  lead_customer_activity_types: "顧客行動タイプ",
  lead_score_rules: "スコアリングルール",
  lead_score_thresholds: "スコア→温度感 変換ルール",
  project_statuses: "プロジェクトステータス",
  skills: "スキル",
};

type GroupKey = "common" | "company" | "account" | "contact" | "lead" | "project" | "talent";

const GROUPS: { key: GroupKey; label: string; tabs: TabKey[] }[] = [
  {
    key: "common",
    label: "共通・取引",
    tabs: ["pipeline", "contract_types", "services"],
  },
  {
    key: "company",
    label: "事業者情報",
    tabs: ["corporate_types", "company_statuses", "company_verification"],
  },
  {
    key: "account",
    label: "取引先",
    tabs: ["account_types", "account_role_types", "account_statuses"],
  },
  {
    key: "contact",
    label: "連絡先",
    tabs: ["contact_statuses"],
  },
  {
    key: "lead",
    label: "リード・マーケティング",
    tabs: [
      "lead_sources", "lead_categories",
      "lead_stages",        // ステージ + ステータスを 1 画面で管理
      "lead_temperatures", "lead_call_statuses",
      "lead_large_segments", // 大セグメント + 小セグメントを 1 画面で管理
      "lead_activity_types",
      // スコアリング（Phase 7）
      "lead_company_sizes", "lead_customer_activity_types", "lead_score_rules", "lead_score_thresholds",
    ],
  },
  {
    key: "project",
    label: "プロジェクト",
    tabs: ["project_statuses"],
  },
  {
    key: "talent",
    label: "タレント",
    tabs: ["skills"],
  },
];

// ===== Styles =====

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
  } as React.CSSProperties,
  title: { color: "var(--color-text-title)" } as React.CSSProperties,
  sub: { color: "var(--color-sumi600)" } as React.CSSProperties,
  btnPrimary: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as React.CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontSize: "0.875rem",
  } as React.CSSProperties,
  btnDanger: {
    backgroundColor: "var(--color-error)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontSize: "0.875rem",
  } as React.CSSProperties,
  btnSmall: {
    padding: "0.25rem 0.75rem",
    fontSize: "0.75rem",
  } as React.CSSProperties,
  tableHeader: {
    backgroundColor: "var(--color-sumi50)",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
  } as React.CSSProperties,
  tableRow: {
    borderBottom: "1px solid var(--color-border-default)",
  } as React.CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.5rem 0.75rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
  } as React.CSSProperties,
  overlay: {
    position: "fixed" as const,
    inset: 0,
    backgroundColor: "var(--color-overlay)",
    zIndex: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as React.CSSProperties,
  modal: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-modal)",
    boxShadow: "var(--elevation-overlay)",
    maxWidth: 480,
    width: "100%",
    padding: "1.5rem",
  } as React.CSSProperties,
  error: { color: "var(--color-error)", fontSize: "0.875rem" } as React.CSSProperties,
};

// ===== Modal Component =====

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ ...styles.title, fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

// ===== Form Modal =====

function FormModal({
  title,
  fields,
  initialValues,
  loading,
  onSubmit,
  onCancel,
}: {
  title: string;
  fields: FieldDef[];
  initialValues: Record<string, unknown>;
  loading: boolean;
  onSubmit: (values: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {fields.map((field) => (
            <div key={field.key}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem" }}>
                {field.label}
              </label>
              {field.helpText && (
                <p style={{ fontSize: "0.75rem", color: "var(--color-sumi500)", marginTop: 0, marginBottom: "0.375rem" }}>
                  {field.helpText}
                </p>
              )}
              {field.type === "textarea" ? (
                <textarea
                  style={{ ...styles.input, minHeight: 80, resize: "vertical" }}
                  value={(values[field.key] as string) ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value || null }))}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-focus)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-default)";
                    e.currentTarget.style.boxShadow = "";
                  }}
                />
              ) : field.type === "select" ? (
                <select
                  style={styles.input}
                  value={(values[field.key] as string) ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value || null }))}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-focus)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-default)";
                    e.currentTarget.style.boxShadow = "";
                  }}
                >
                  <option value="">-- 選択 --</option>
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : field.type === "number" ? (
                <input
                  type="number"
                  style={styles.input}
                  value={
                    field.nullable
                      ? values[field.key] == null ? "" : (values[field.key] as number)
                      : (values[field.key] as number) ?? 0
                  }
                  placeholder={field.nullable ? "空欄=自動設定しない" : undefined}
                  min={field.min}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (field.nullable) {
                      setValues((v) => ({ ...v, [field.key]: raw === "" ? null : (parseInt(raw) || 0) }));
                    } else {
                      setValues((v) => ({ ...v, [field.key]: parseInt(raw) || 0 }));
                    }
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-focus)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-default)";
                    e.currentTarget.style.boxShadow = "";
                  }}
                />
              ) : (
                <input
                  type="text"
                  style={styles.input}
                  value={(values[field.key] as string) ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-focus)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-default)";
                    e.currentTarget.style.boxShadow = "";
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1.5rem" }}>
          <button type="button" style={styles.btnOutline} onClick={onCancel} disabled={loading}>
            キャンセル
          </button>
          <button type="submit" style={styles.btnPrimary} disabled={loading}>
            {loading ? "処理中..." : "保存"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ===== SimpleMasterTab =====

function SimpleMasterTab({
  title,
  items,
  onCreate,
  onUpdate,
  onDelete,
  onRefresh,
  fields,
}: {
  title: string;
  items: MasterItem[];
  onCreate: (input: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>;
  onUpdate: (id: string, input: Record<string, unknown>) => Promise<{ data: unknown; error: string | null }>;
  onDelete: (id: string) => Promise<{ data: unknown; error: string | null }>;
  onRefresh: () => void;
  fields: FieldDef[];
}) {
  const { showToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<MasterItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<MasterItem | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCreate = async (values: Record<string, unknown>) => {
    setLoading(true);
    const result = await onCreate(values);
    setLoading(false);
    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    showToast({ type: "success", message: `${title}を追加しました` });
    setShowCreate(false);
    onRefresh();
  };

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editItem) return;
    setLoading(true);
    const result = await onUpdate(editItem.id, values);
    setLoading(false);
    if (result.error) {
      showToast({ type: "error", message: result.error });
      return;
    }
    showToast({ type: "success", message: `${title}を保存しました` });
    setEditItem(null);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteItem) return { error: "対象が不明です" };
    const result = await onDelete(deleteItem.id);
    if (result.error) return { error: result.error };
    showToast({ type: "success", message: `${title}を削除しました` });
    setDeleteItem(null);
    onRefresh();
    return { error: null };
  };

  const defaultValues: Record<string, unknown> = {};
  for (const f of fields) {
    defaultValues[f.key] = f.type === "number" ? (f.nullable ? null : 0) : "";
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ ...styles.title, fontSize: "1rem", fontWeight: 600 }}>{title}</h2>
        <button style={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          追加
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            {fields.map((f) => (
              <col key={f.key} style={{ width: resolveFieldWidth(f) }} />
            ))}
            <col style={{ width: "140px" }} />
          </colgroup>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key} style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem" }}>
                  {f.label}
                </th>
              ))}
              <th style={{ ...styles.tableHeader, textAlign: "right", padding: "0.75rem" }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={fields.length + 1} style={{ padding: "2rem", textAlign: "center", ...styles.sub }}>
                  データがありません
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  {fields.map((f) => {
                    const raw = item[f.key];
                    if (f.colorSwatch && raw) {
                      const hex = String(raw);
                      return (
                        <td key={f.key} style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                            <span
                              style={{
                                display: "inline-block",
                                width: 14,
                                height: 14,
                                borderRadius: "var(--radius-badge)",
                                backgroundColor: hex,
                                border: "1px solid var(--color-border-default)",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ color: "var(--color-sumi600)", fontFamily: "monospace" }}>{hex}</span>
                          </span>
                        </td>
                      );
                    }
                    let display: string;
                    let isEmptyOverride = false;
                    if (raw == null || raw === "") {
                      display = f.emptyDisplay ?? "-";
                      isEmptyOverride = f.emptyDisplay != null;
                    } else if (f.type === "select" && f.options) {
                      const opt = f.options.find((o) => o.value === raw);
                      display = opt?.label ?? String(raw);
                    } else if (f.unit) {
                      display = `${String(raw)}${f.unit}`;
                    } else {
                      display = String(raw);
                    }
                    return (
                      <td
                        key={f.key}
                        style={{
                          padding: "0.75rem",
                          fontSize: "0.875rem",
                          wordBreak: "break-word",
                          whiteSpace: f.type === "textarea" ? "normal" : "nowrap",
                          overflow: f.type === "textarea" ? undefined : "hidden",
                          textOverflow: f.type === "textarea" ? undefined : "ellipsis",
                        }}
                        title={f.type !== "textarea" && display !== "-" ? display : undefined}
                      >
                        {isEmptyOverride ? (
                          <span style={{ color: "var(--color-sumi400)", fontStyle: "italic" }}>{display}</span>
                        ) : (
                          display
                        )}
                      </td>
                    );
                  })}
                  <td style={{ padding: "0.75rem", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button
                        style={{ ...styles.btnOutline, ...styles.btnSmall }}
                        onClick={() => setEditItem(item)}
                      >
                        編集
                      </button>
                      <button
                        style={{ ...styles.btnDanger, ...styles.btnSmall }}
                        onClick={() => setDeleteItem(item)}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </TableRow>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <FormModal
          title={`${title}を追加`}
          fields={fields}
          initialValues={defaultValues}
          loading={loading}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <FormModal
          title={`${title}を編集`}
          fields={fields}
          initialValues={Object.fromEntries(fields.map((f) => [f.key, editItem[f.key]]))}
          loading={loading}
          onSubmit={handleUpdate}
          onCancel={() => setEditItem(null)}
        />
      )}

      {/* Delete Modal */}
      <ConfirmDialog
        open={deleteItem !== null}
        title="削除確認"
        message={deleteItem ? `「${deleteItem.name}」を本当に削除しますか？` : ""}
        confirmLabel="削除"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteItem(null)}
      />
    </div>
  );
}

// ===== TableRow with hover =====

function TableRow({ children }: { children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      style={{
        ...styles.tableRow,
        backgroundColor: hovered ? "var(--color-bg-hover)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </tr>
  );
}

// ===== Pipeline Tab =====

function PipelineTab() {
  const [pipelines, setPipelines] = useState<MasterItem[]>([]);
  const [stages, setStages] = useState<MasterItem[]>([]);
  const [statuses, setStatuses] = useState<MasterItem[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const loadPipelines = useCallback(async () => {
    setLoadingData(true);
    const result = await getPipelineTypes();
    setPipelines((result.data as MasterItem[]) ?? []);
    setLoadingData(false);
  }, []);

  const loadStages = useCallback(async (pipelineId: string) => {
    const result = await getDealStages(pipelineId);
    setStages((result.data as MasterItem[]) ?? []);
  }, []);

  const loadStatuses = useCallback(async (pipelineId: string) => {
    const result = await getDealStatuses(pipelineId);
    setStatuses((result.data as MasterItem[]) ?? []);
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    if (selectedPipeline) {
      loadStages(selectedPipeline);
      loadStatuses(selectedPipeline);
    } else {
      setStages([]);
      setStatuses([]);
    }
  }, [selectedPipeline, loadStages, loadStatuses]);

  const pipelineFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    {
      key: "default_close_months",
      label: "クローズ予定日の既定（ヶ月後）",
      type: "number",
      min: 0,
      width: "180px",
      nullable: true,
      helpText:
        "商談を新規作成したとき、クローズ予定日を今日から何ヶ月後に初期設定するか（作成後も手動で変更可）。空欄なら自動設定しない",
      emptyDisplay: "自動設定しない",
      unit: "ヶ月後",
    },
    { key: "sort_order", label: "表示順", type: "number" },
  ];

  const stageFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    { key: "current_situation", label: "現在の状況", type: "textarea" },
    { key: "sort_order", label: "表示順", type: "number" },
    { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
  ];

  const stageOptions = stages.map((s) => ({ value: s.id, label: s.name }));
  const statusFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    { key: "deal_stage_id", label: "商談ステージ", type: "select", options: stageOptions },
    { key: "sort_order", label: "表示順", type: "number" },
    { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
  ];

  if (loadingData) {
    return <p style={styles.sub}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Pipeline list */}
      <SimpleMasterTab
        title="パイプライン種別"
        items={pipelines}
        onCreate={createPipelineType}
        onUpdate={updatePipelineType}
        onDelete={deletePipelineType}
        onRefresh={() => { loadPipelines(); setSelectedPipeline(null); }}
        fields={pipelineFields}
      />

      {/* Pipeline selector */}
      <div>
        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem", display: "block" }}>
          パイプラインを選択してステージ・ステータスを管理
        </label>
        <select
          style={{ ...styles.input, maxWidth: 320 }}
          value={selectedPipeline ?? ""}
          onChange={(e) => setSelectedPipeline(e.target.value || null)}
        >
          <option value="">-- パイプラインを選択 --</option>
          {pipelines.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {selectedPipeline && (
        <>
          {/* Stages */}
          <div style={{ ...styles.card, padding: "1.25rem" }}>
            <SimpleMasterTab
              title="商談ステージ"
              items={stages}
              onCreate={(input) => createDealStage({ ...input, pipeline_type_id: selectedPipeline })}
              onUpdate={updateDealStage}
              onDelete={deleteDealStage}
              onRefresh={() => { loadStages(selectedPipeline); loadStatuses(selectedPipeline); }}
              fields={stageFields}
            />
          </div>

          {/* Statuses */}
          <div style={{ ...styles.card, padding: "1.25rem" }}>
            <SimpleMasterTab
              title="商談ステータス"
              items={statuses}
              onCreate={(input) => createDealStatus({ ...input, pipeline_type_id: selectedPipeline })}
              onUpdate={updateDealStatus}
              onDelete={deleteDealStatus}
              onRefresh={() => loadStatuses(selectedPipeline)}
              fields={statusFields}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ===== Skills Tab =====

function SkillsTab() {
  const [categories, setCategories] = useState<MasterItem[]>([]);
  const [skills, setSkills] = useState<MasterItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const loadCategories = useCallback(async () => {
    setLoadingData(true);
    const result = await getSkillCategories();
    setCategories((result.data as MasterItem[]) ?? []);
    setLoadingData(false);
  }, []);

  const loadSkills = useCallback(async (categoryId: string) => {
    const result = await getSkills(categoryId);
    setSkills((result.data as MasterItem[]) ?? []);
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (selectedCategory) {
      loadSkills(selectedCategory);
    } else {
      setSkills([]);
    }
  }, [selectedCategory, loadSkills]);

  const categoryFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    { key: "sort_order", label: "表示順", type: "number" },
  ];

  const skillFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    { key: "sort_order", label: "表示順", type: "number" },
  ];

  if (loadingData) {
    return <p style={styles.sub}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Categories */}
      <SimpleMasterTab
        title="スキルカテゴリ"
        items={categories}
        onCreate={createSkillCategory}
        onUpdate={updateSkillCategory}
        onDelete={deleteSkillCategory}
        onRefresh={() => { loadCategories(); setSelectedCategory(null); }}
        fields={categoryFields}
      />

      {/* Category selector */}
      <div>
        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem", display: "block" }}>
          カテゴリを選択してスキルを管理
        </label>
        <select
          style={{ ...styles.input, maxWidth: 320 }}
          value={selectedCategory ?? ""}
          onChange={(e) => setSelectedCategory(e.target.value || null)}
        >
          <option value="">-- カテゴリを選択 --</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {selectedCategory && (
        <div style={{ ...styles.card, padding: "1.25rem" }}>
          <SimpleMasterTab
            title="スキル"
            items={skills}
            onCreate={(input) => createSkill({ ...input, skill_category_id: selectedCategory })}
            onUpdate={updateSkill}
            onDelete={deleteSkill}
            onRefresh={() => loadSkills(selectedCategory)}
            fields={skillFields}
          />
        </div>
      )}
    </div>
  );
}

// ===== Lead Stages & Statuses Tab =====

function LeadStagesTab() {
  const [stages, setStages] = useState<MasterItem[]>([]);
  const [statuses, setStatuses] = useState<MasterItem[]>([]);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const loadStages = useCallback(async () => {
    setLoadingData(true);
    const result = await getLeadStages();
    setStages((result.data as MasterItem[]) ?? []);
    setLoadingData(false);
  }, []);

  const loadStatuses = useCallback(async (stageId?: string) => {
    const result = await getLeadStatuses(stageId);
    setStatuses((result.data as MasterItem[]) ?? []);
  }, []);

  useEffect(() => {
    loadStages();
  }, [loadStages]);

  useEffect(() => {
    loadStatuses(selectedStage ?? undefined);
  }, [selectedStage, loadStatuses]);

  const stageFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    { key: "sort_order", label: "表示順", type: "number" },
    { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
  ];

  const stageOptions = [
    { value: "", label: "（未分類）" },
    ...stages.map((s) => ({ value: s.id, label: s.name })),
  ];
  const statusFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    { key: "stage_id", label: "リードステージ", type: "select", options: stageOptions },
    { key: "sort_order", label: "表示順", type: "number" },
    { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
  ];

  if (loadingData) {
    return <p style={styles.sub}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <SimpleMasterTab
        title="リードステージ"
        items={stages}
        onCreate={createLeadStage}
        onUpdate={updateLeadStage}
        onDelete={deleteLeadStage}
        onRefresh={() => { loadStages(); setSelectedStage(null); }}
        fields={stageFields}
      />

      <div>
        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem", display: "block" }}>
          ステージでフィルタしてステータスを管理
        </label>
        <select
          style={{ ...styles.input, maxWidth: 320 }}
          value={selectedStage ?? ""}
          onChange={(e) => setSelectedStage(e.target.value || null)}
        >
          <option value="">すべてのステータスを表示</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{ ...styles.card, padding: "1.25rem" }}>
        <SimpleMasterTab
          title="リードステータス"
          items={statuses}
          onCreate={createLeadStatus}
          onUpdate={updateLeadStatus}
          onDelete={deleteLeadStatus}
          onRefresh={() => loadStatuses(selectedStage ?? undefined)}
          fields={statusFields}
        />
      </div>
    </div>
  );
}

// ===== Lead Segments Tab =====

function LeadSegmentsTab() {
  const [largeSegments, setLargeSegments] = useState<MasterItem[]>([]);
  const [smallSegments, setSmallSegments] = useState<MasterItem[]>([]);
  const [selectedLarge, setSelectedLarge] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const loadLarge = useCallback(async () => {
    setLoadingData(true);
    const result = await getLeadLargeSegments();
    setLargeSegments((result.data as MasterItem[]) ?? []);
    setLoadingData(false);
  }, []);

  const loadSmall = useCallback(async (largeId?: string) => {
    const result = await getLeadSmallSegments(largeId);
    setSmallSegments((result.data as MasterItem[]) ?? []);
  }, []);

  useEffect(() => {
    loadLarge();
  }, [loadLarge]);

  useEffect(() => {
    loadSmall(selectedLarge ?? undefined);
  }, [selectedLarge, loadSmall]);

  const largeFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
  ];

  const largeOptions = [
    { value: "", label: "（未分類）" },
    ...largeSegments.map((s) => ({ value: s.id, label: s.name })),
  ];
  const smallFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "definition", label: "定義", type: "textarea" },
    { key: "large_segment_id", label: "大セグメント", type: "select", options: largeOptions },
  ];

  if (loadingData) {
    return <p style={styles.sub}>読み込み中...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <SimpleMasterTab
        title="大セグメント"
        items={largeSegments}
        onCreate={createLeadLargeSegment}
        onUpdate={updateLeadLargeSegment}
        onDelete={deleteLeadLargeSegment}
        onRefresh={() => { loadLarge(); setSelectedLarge(null); }}
        fields={largeFields}
      />

      <div>
        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem", display: "block" }}>
          大セグメントでフィルタして小セグメントを管理
        </label>
        <select
          style={{ ...styles.input, maxWidth: 320 }}
          value={selectedLarge ?? ""}
          onChange={(e) => setSelectedLarge(e.target.value || null)}
        >
          <option value="">すべての小セグメントを表示</option>
          {largeSegments.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{ ...styles.card, padding: "1.25rem" }}>
        <SimpleMasterTab
          title="小セグメント"
          items={smallSegments}
          onCreate={createLeadSmallSegment}
          onUpdate={updateLeadSmallSegment}
          onDelete={deleteLeadSmallSegment}
          onRefresh={() => loadSmall(selectedLarge ?? undefined)}
          fields={smallFields}
        />
      </div>
    </div>
  );
}

// ===== Lead Score Rules Tab（参照切れハイライト付き）=====

type ScoreRuleMasters = {
  companySizes: MasterItem[];
  leadSources: MasterItem[];
  leadStages: MasterItem[];
  leadStatuses: MasterItem[];
  leadCallStatuses: MasterItem[];
  leadActivityTypes: MasterItem[];
  leadCustomerActivityTypes: MasterItem[];
  leadLargeSegments: MasterItem[];
  leadSmallSegments: MasterItem[];
};

function LeadScoreRulesTab({ scoreMasters }: { scoreMasters?: ScoreRuleMasters }) {
  const [rulesData, setRulesData] = useState<{
    rules: LeadScoreRule[];
    brokenCount: number;
  } | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<LeadScoreRule | null>(null);
  const [deleteItem, setDeleteItem] = useState<LeadScoreRule | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const CATEGORY_OPTIONS = [
    { value: "attribute", label: "属性" },
    { value: "interest", label: "興味" },
    { value: "stage", label: "ステージ" },
    { value: "status", label: "ステータス" },
    { value: "activity", label: "対応" },
  ];
  const CONDITION_TYPE_OPTIONS = [
    { value: "company_size", label: "企業規模" },
    { value: "large_segment", label: "大セグメント" },
    { value: "small_segment", label: "小セグメント" },
    { value: "lead_source", label: "リードソース" },
    { value: "stage", label: "ステージ" },
    { value: "status", label: "ステータス" },
    { value: "call_status", label: "コールステータス" },
    { value: "activity_type", label: "対応種別" },
    { value: "customer_activity_type", label: "顧客行動タイプ" },
  ];

  const loadRules = useCallback(async () => {
    setLoadingData(true);
    const result = await getLeadScoreRulesWithBrokenRefs();
    setRulesData(result.data);
    setLoadingData(false);
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const formFields: FieldDef[] = [
    { key: "category", label: "カテゴリ", type: "select", options: CATEGORY_OPTIONS },
    { key: "condition_type", label: "条件タイプ", type: "select", options: CONDITION_TYPE_OPTIONS },
    { key: "condition_value_id", label: "条件値ID（UUID）", type: "text" },
    { key: "score_delta", label: "加点値（0-100）", type: "number", min: 0 },
    { key: "description", label: "説明", type: "textarea" },
    { key: "sort_order", label: "表示順", type: "number", min: 0 },
  ];

  const handleCreate = async (values: Record<string, unknown>) => {
    setLoading(true);
    const result = await createLeadScoreRule(values);
    setLoading(false);
    if (result.error) { showToast({ type: "error", message: result.error }); return; }
    showToast({ type: "success", message: "スコアリングルールを追加しました" });
    setShowCreate(false); loadRules();
  };
  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editItem) return;
    setLoading(true);
    const result = await updateLeadScoreRule(editItem.id, values);
    setLoading(false);
    if (result.error) { showToast({ type: "error", message: result.error }); return; }
    showToast({ type: "success", message: "スコアリングルールを保存しました" });
    setEditItem(null); loadRules();
  };
  const handleDelete = async () => {
    if (!deleteItem) return { error: "対象が不明です" };
    const result = await deleteLeadScoreRule(deleteItem.id);
    if (result.error) return { error: result.error };
    showToast({ type: "success", message: "スコアリングルールを削除しました" });
    setDeleteItem(null); loadRules();
    return { error: null };
  };

  if (loadingData) return <p style={styles.sub}>読み込み中...</p>;

  const rules = rulesData?.rules ?? [];
  const brokenCount = rulesData?.brokenCount ?? 0;

  const defaultValues: Record<string, unknown> = { category: "", condition_type: "", condition_value_id: "", score_delta: 0, description: "", sort_order: 0 };

  const catLabel = (v: string) => CATEGORY_OPTIONS.find((o) => o.value === v)?.label ?? v;
  const ctLabel = (v: string) => CONDITION_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;

  /** condition_type + condition_value_id から名前を解決 */
  const resolveConditionValueName = (conditionType: string, valueId: string | null): string | null => {
    if (!valueId || !scoreMasters) return null;
    const listMap: Record<string, MasterItem[]> = {
      company_size: scoreMasters.companySizes,
      lead_source: scoreMasters.leadSources,
      stage: scoreMasters.leadStages,
      status: scoreMasters.leadStatuses,
      call_status: scoreMasters.leadCallStatuses,
      activity_type: scoreMasters.leadActivityTypes,
      customer_activity_type: scoreMasters.leadCustomerActivityTypes,
      large_segment: scoreMasters.leadLargeSegments,
      small_segment: scoreMasters.leadSmallSegments,
    };
    const list = listMap[conditionType];
    if (!list) return null;
    return list.find((item) => item.id === valueId)?.name ?? null;
  };

  return (
    <div>
      {/* 参照切れバナー */}
      {brokenCount > 0 && (
        <div style={{
          backgroundColor: "rgba(239,68,68,0.06)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderLeft: "4px solid var(--color-error)",
          borderRadius: "var(--radius-card)",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          color: "var(--color-error)",
          fontSize: "0.875rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}>
          <span style={{ fontSize: "1rem", flexShrink: 0 }}>⚠</span>
          <span>
            <span style={{ fontWeight: 600 }}>参照切れルールが {brokenCount} 件あります。</span>
            {" "}条件値として設定されたマスタが削除されています。該当ルールを編集・削除して修正してください。
          </span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ ...styles.title, fontSize: "1rem", fontWeight: 600 }}>スコアリングルール</h2>
        <button style={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          追加
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem", width: "100px" }}>カテゴリ</th>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem", width: "140px" }}>条件タイプ</th>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem" }}>条件値</th>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem", width: "80px" }}>加点</th>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem" }}>説明</th>
              <th style={{ ...styles.tableHeader, textAlign: "right", padding: "0.75rem", width: "120px" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "2rem", textAlign: "center", ...styles.sub }}>データがありません</td>
              </tr>
            ) : rules.map((rule) => (
              <ScoreRuleTableRow
                key={rule.id}
                rule={rule}
                catLabel={catLabel}
                ctLabel={ctLabel}
                conditionValueName={resolveConditionValueName(rule.condition_type, rule.condition_value_id)}
                onEdit={() => setEditItem(rule)}
                onDelete={() => setDeleteItem(rule)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <FormModal
          title="スコアリングルールを追加"
          fields={formFields}
          initialValues={defaultValues}
          loading={loading}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {editItem && (
        <FormModal
          title="スコアリングルールを編集"
          fields={formFields}
          initialValues={Object.fromEntries(
            formFields.map((f) => [
              f.key,
              (editItem as Record<string, unknown>)[f.key],
            ])
          )}
          loading={loading}
          onSubmit={handleUpdate}
          onCancel={() => setEditItem(null)}
        />
      )}
      <ConfirmDialog
        open={deleteItem !== null}
        title="削除確認"
        message={deleteItem ? `「${deleteItem.description ?? deleteItem.condition_type}」を本当に削除しますか？` : ""}
        confirmLabel="削除"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteItem(null)}
      />
    </div>
  );
}

function ScoreRuleTableRow({
  rule,
  catLabel,
  ctLabel,
  conditionValueName,
  onEdit,
  onDelete,
}: {
  rule: LeadScoreRule;
  catLabel: (v: string) => string;
  ctLabel: (v: string) => string;
  conditionValueName: string | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isBroken = rule._refBroken === true;
  return (
    <tr
      style={{
        ...styles.tableRow,
        backgroundColor: isBroken
          ? "rgba(239,68,68,0.06)"
          : hovered ? "var(--color-bg-hover)" : "transparent",
        borderLeft: isBroken ? "3px solid var(--color-error)" : "3px solid transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{catLabel(rule.category)}</td>
      <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{ctLabel(rule.condition_type)}</td>
      <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
        {isBroken ? (
          <span style={{ color: "var(--color-error)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
            <span>⚠</span>
            参照先が削除済み
          </span>
        ) : conditionValueName ? (
          <span style={{ color: "var(--color-text-body)", fontWeight: 500 }}>
            {conditionValueName}
          </span>
        ) : (
          <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
            {rule.condition_value_id ?? "-"}
          </span>
        )}
      </td>
      <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>+{rule.score_delta}</td>
      <td style={{ padding: "0.75rem", fontSize: "0.875rem", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={rule.description ?? undefined}>
        {rule.description ?? "-"}
      </td>
      <td style={{ padding: "0.75rem", textAlign: "right" }}>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button style={{ ...styles.btnOutline, ...styles.btnSmall }} onClick={onEdit}>編集</button>
          <button style={{ ...styles.btnDanger, ...styles.btnSmall }} onClick={onDelete}>削除</button>
        </div>
      </td>
    </tr>
  );
}

// ===== LeadScoreThresholdsTab =====

/**
 * スコア→温度感 変換ルール タブ
 * temperature_id を UUID 生文字で表示せず、leadTemperatures から名前を解決して表示する。
 * 追加・編集モーダルでも temperature_id は select 選択方式を採用。
 */
function LeadScoreThresholdsTab({ leadTemperatures }: { leadTemperatures: MasterItem[] }) {
  const [thresholds, setThresholds] = useState<LeadScoreThreshold[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<LeadScoreThreshold | null>(null);
  const [deleteItem, setDeleteItem] = useState<LeadScoreThreshold | null>(null);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const loadThresholds = useCallback(async () => {
    setLoadingData(true);
    const result = await getLeadScoreThresholds();
    setThresholds(result.data ?? []);
    setLoadingData(false);
  }, []);

  useEffect(() => { loadThresholds(); }, [loadThresholds]);

  const temperatureOptions = leadTemperatures.map((t) => ({ value: t.id, label: t.name }));

  const formFields: FieldDef[] = [
    { key: "min_score", label: "最小スコア", type: "number", min: 0 },
    { key: "max_score", label: "最大スコア（空白=上限なし）", type: "number", min: 0 },
    { key: "temperature_id", label: "温度感", type: "select", options: temperatureOptions },
  ];

  const handleCreate = async (_values: Record<string, unknown>) => {
    setLoading(true);
    const result = await Promise.resolve({ data: null, error: "この画面からは作成できません。DBマイグレーションで管理してください。" });
    setLoading(false);
    if (result.error) { showToast({ type: "error", message: result.error }); return; }
  };
  const handleUpdate = async (_values: Record<string, unknown>) => {
    setLoading(true);
    const result = await Promise.resolve({ data: null, error: "この画面からは更新できません。DBマイグレーションで管理してください。" });
    setLoading(false);
    if (result.error) { showToast({ type: "error", message: result.error }); return; }
  };
  const handleDelete = async () => {
    return { error: "この画面からは削除できません。DBマイグレーションで管理してください。" };
  };

  const resolveTemperatureName = (temperatureId: string | null): string => {
    if (!temperatureId) return "-";
    return leadTemperatures.find((t) => t.id === temperatureId)?.name ?? temperatureId;
  };

  if (loadingData) return <p style={styles.sub}>読み込み中...</p>;

  const defaultValues: Record<string, unknown> = { min_score: 0, max_score: "", temperature_id: "" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ ...styles.title, fontSize: "1rem", fontWeight: 600 }}>スコア→温度感 変換ルール</h2>
        <button style={styles.btnPrimary} onClick={() => setShowCreate(true)}>
          追加
        </button>
      </div>

      <p style={{ ...styles.sub, marginBottom: "1rem" }}>
        スコア帯と温度感マスタを紐付けるルールです。変更はDBマイグレーションで管理してください。
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem", width: "110px" }}>最小スコア</th>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem", width: "140px" }}>最大スコア</th>
              <th style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem" }}>温度感</th>
              <th style={{ ...styles.tableHeader, textAlign: "right", padding: "0.75rem", width: "120px" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {thresholds.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: "2rem", textAlign: "center", ...styles.sub }}>データがありません</td>
              </tr>
            ) : thresholds.map((t) => (
              <ThresholdTableRow
                key={t.id}
                item={t}
                temperatureName={resolveTemperatureName(t.temperature_id)}
                onEdit={() => setEditItem(t)}
                onDelete={() => setDeleteItem(t)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <FormModal
          title="変換ルールを追加"
          fields={formFields}
          initialValues={defaultValues}
          loading={loading}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}
      {editItem && (
        <FormModal
          title="変換ルールを編集"
          fields={formFields}
          initialValues={{ min_score: editItem.min_score, max_score: editItem.max_score ?? "", temperature_id: editItem.temperature_id ?? "" }}
          loading={loading}
          onSubmit={handleUpdate}
          onCancel={() => setEditItem(null)}
        />
      )}
      <ConfirmDialog
        open={deleteItem !== null}
        title="削除確認"
        message={deleteItem ? `「${resolveTemperatureName(deleteItem.temperature_id)}」を本当に削除しますか？` : ""}
        confirmLabel="削除"
        danger
        onConfirm={handleDelete}
        onClose={() => setDeleteItem(null)}
      />
    </div>
  );
}

function ThresholdTableRow({
  item,
  temperatureName,
  onEdit,
  onDelete,
}: {
  item: LeadScoreThreshold;
  temperatureName: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr
      style={{
        ...styles.tableRow,
        backgroundColor: hovered ? "var(--color-bg-hover)" : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{item.min_score}</td>
      <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
        {item.max_score != null ? item.max_score : <span style={{ color: "var(--color-sumi400)" }}>上限なし</span>}
      </td>
      <td style={{ padding: "0.75rem", fontSize: "0.875rem", fontWeight: 500 }}>{temperatureName}</td>
      <td style={{ padding: "0.75rem", textAlign: "right" }}>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button style={{ ...styles.btnOutline, ...styles.btnSmall }} onClick={onEdit}>編集</button>
          <button style={{ ...styles.btnDanger, ...styles.btnSmall }} onClick={onDelete}>削除</button>
        </div>
      </td>
    </tr>
  );
}

// ===== Group Tab Button =====

function GroupTabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "0.625rem 1.25rem",
        fontSize: "0.9375rem",
        fontWeight: isActive ? 700 : 500,
        color: isActive ? "var(--color-terra)" : hovered ? "var(--color-text-title)" : "var(--color-sumi600)",
        borderBottom: isActive ? "3px solid var(--color-terra)" : "3px solid transparent",
        background: "none",
        border: "none",
        borderBottomWidth: 3,
        borderBottomStyle: "solid",
        borderBottomColor: isActive ? "var(--color-terra)" : "transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "color 0.15s, border-color 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ===== Master Tab Button =====

function MasterTabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "0.375rem 0.875rem",
        fontSize: "0.8125rem",
        fontWeight: isActive ? 600 : 400,
        color: isActive ? "var(--color-terra)" : hovered ? "var(--color-text-title)" : "var(--color-sumi600)",
        borderBottom: isActive ? "2px solid var(--color-terra)" : "2px solid transparent",
        background: "none",
        border: "none",
        borderBottomWidth: 2,
        borderBottomStyle: "solid",
        borderBottomColor: isActive ? "var(--color-terra)" : "transparent",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "color 0.15s, border-color 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ===== Main AdminView =====

export function AdminView() {
  const [activeGroup, setActiveGroup] = useState<GroupKey>(GROUPS[0].key);
  const [activeTab, setActiveTab] = useState<TabKey>(GROUPS[0].tabs[0]);

  // Data state for simple masters
  const [contractTypes, setContractTypes] = useState<MasterItem[]>([]);
  const [corporateTypes, setCorporateTypes] = useState<MasterItem[]>([]);
  const [services, setServices] = useState<MasterItem[]>([]);
  const [leadSources, setLeadSources] = useState<MasterItem[]>([]);
  const [leadCategories, setLeadCategories] = useState<MasterItem[]>([]);
  const [leadActivityTypes, setLeadActivityTypes] = useState<MasterItem[]>([]);
  const [leadTemperatures, setLeadTemperatures] = useState<MasterItem[]>([]);
  const [leadCallStatuses, setLeadCallStatuses] = useState<MasterItem[]>([]);
  const [accountTypes, setAccountTypes] = useState<MasterItem[]>([]);
  const [accountRoleTypes, setAccountRoleTypes] = useState<MasterItem[]>([]);
  // 取引先区分の「自動付与するパイプライン」選択肢に使う
  const [pipelineTypes, setPipelineTypes] = useState<MasterItem[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<MasterItem[]>([]);
  const [contactStatuses, setContactStatuses] = useState<MasterItem[]>([]);
  const [companyStatuses, setCompanyStatuses] = useState<MasterItem[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<MasterItem[]>([]);
  const [leadCompanySizes, setLeadCompanySizes] = useState<MasterItem[]>([]);
  const [leadCustomerActivityTypes, setLeadCustomerActivityTypes] = useState<MasterItem[]>([]);
  const [allLeadLargeSegments, setAllLeadLargeSegments] = useState<MasterItem[]>([]);
  const [allLeadSmallSegments, setAllLeadSmallSegments] = useState<MasterItem[]>([]);
  const [allLeadStages, setAllLeadStages] = useState<MasterItem[]>([]);
  const [allLeadStatuses, setAllLeadStatuses] = useState<MasterItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  /**
   * TODO(future): 現在 17 マスタを一括 Promise.all でロードしている。
   * グループ切替時にそのグループに必要なマスタのみをレイジーロードする方式に
   * 変更することで初期ロードのウォーターフォールを削減できる。
   * 優先度: 低（マスタ件数が少ない間は実質問題なし）
   */
  const loadAllSimpleMasters = useCallback(async () => {
    setLoadingData(true);
    const [ct, corp, svc, ls, lc, lat, ltemp, lcs, at, as_, cs, cps, ps, lcsizes, lcatypes] = await Promise.all([
      getContractTypes(),
      getCorporateTypes(),
      getServices(),
      getLeadSources(),
      getLeadCategories(),
      getLeadActivityTypes(),
      getLeadTemperatures(),
      getLeadCallStatuses(),
      getAccountTypes(),
      getAccountStatuses(),
      getContactStatuses(),
      getCompanyStatuses(),
      getProjectStatusesMasters(),
      getLeadCompanySizes(),
      getLeadCustomerActivityTypes(),
    ]);
    setContractTypes((ct.data as MasterItem[]) ?? []);
    setCorporateTypes((corp.data as MasterItem[]) ?? []);
    setServices((svc.data as MasterItem[]) ?? []);
    setLeadSources((ls.data as MasterItem[]) ?? []);
    setLeadCategories((lc.data as MasterItem[]) ?? []);
    setLeadActivityTypes((lat.data as MasterItem[]) ?? []);
    setLeadTemperatures((ltemp.data as MasterItem[]) ?? []);
    setLeadCallStatuses((lcs.data as MasterItem[]) ?? []);
    setAccountTypes((at.data as MasterItem[]) ?? []);
    setAccountStatuses((as_.data as MasterItem[]) ?? []);
    setContactStatuses((cs.data as MasterItem[]) ?? []);
    setCompanyStatuses((cps.data as MasterItem[]) ?? []);
    setProjectStatuses((ps.data as MasterItem[]) ?? []);
    setLeadCompanySizes((lcsizes.data as MasterItem[]) ?? []);
    setLeadCustomerActivityTypes((lcatypes.data as MasterItem[]) ?? []);
    // スコアルール名前解決用に大・小セグメント・ステージ・ステータスも並行ロード。
    // パイプラインは取引先区分の「自動付与するパイプライン」選択肢に使う
    const [llargeSegs, lsmallSegs, lstages, lstatuses, artypes, pts] = await Promise.all([
      getLeadLargeSegments(),
      getLeadSmallSegments(undefined),
      getLeadStages(),
      getLeadStatuses(undefined),
      getAccountRoleTypesMaster(),
      getPipelineTypes(),
    ]);
    setAllLeadLargeSegments((llargeSegs.data as MasterItem[]) ?? []);
    setAllLeadSmallSegments((lsmallSegs.data as MasterItem[]) ?? []);
    setAllLeadStages((lstages.data as MasterItem[]) ?? []);
    setAllLeadStatuses((lstatuses.data as MasterItem[]) ?? []);
    setAccountRoleTypes((artypes.data as MasterItem[]) ?? []);
    setPipelineTypes((pts.data as MasterItem[]) ?? []);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    loadAllSimpleMasters();
  }, [loadAllSimpleMasters]);

  // グループ切替時にそのグループの最初のタブを選択
  const handleGroupChange = (groupKey: GroupKey) => {
    setActiveGroup(groupKey);
    const group = GROUPS.find((g) => g.key === groupKey);
    if (group) setActiveTab(group.tabs[0]);
  };

  const refreshContractTypes = async () => {
    const r = await getContractTypes();
    setContractTypes((r.data as MasterItem[]) ?? []);
  };
  const refreshCorporateTypes = async () => {
    const r = await getCorporateTypes();
    setCorporateTypes((r.data as MasterItem[]) ?? []);
  };
  const refreshServices = async () => {
    const r = await getServices();
    setServices((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadSources = async () => {
    const r = await getLeadSources();
    setLeadSources((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadCategories = async () => {
    const r = await getLeadCategories();
    setLeadCategories((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadActivityTypes = async () => {
    const r = await getLeadActivityTypes();
    setLeadActivityTypes((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadTemperatures = async () => {
    const r = await getLeadTemperatures();
    setLeadTemperatures((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadCallStatuses = async () => {
    const r = await getLeadCallStatuses();
    setLeadCallStatuses((r.data as MasterItem[]) ?? []);
  };
  const refreshAccountTypes = async () => {
    const r = await getAccountTypes();
    setAccountTypes((r.data as MasterItem[]) ?? []);
  };
  const refreshAccountRoleTypes = async () => {
    const r = await getAccountRoleTypesMaster();
    setAccountRoleTypes((r.data as MasterItem[]) ?? []);
  };
  const refreshAccountStatuses = async () => {
    const r = await getAccountStatuses();
    setAccountStatuses((r.data as MasterItem[]) ?? []);
  };
  const refreshContactStatuses = async () => {
    const r = await getContactStatuses();
    setContactStatuses((r.data as MasterItem[]) ?? []);
  };
  const refreshCompanyStatuses = async () => {
    const r = await getCompanyStatuses();
    setCompanyStatuses((r.data as MasterItem[]) ?? []);
  };
  const refreshProjectStatuses = async () => {
    const r = await getProjectStatusesMasters();
    setProjectStatuses((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadCompanySizes = async () => {
    const r = await getLeadCompanySizes();
    setLeadCompanySizes((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadCustomerActivityTypes = async () => {
    const r = await getLeadCustomerActivityTypes();
    setLeadCustomerActivityTypes((r.data as MasterItem[]) ?? []);
  };

  const renderTab = () => {
    // Special compound tabs
    if (activeTab === "pipeline") return <PipelineTab />;
    if (activeTab === "skills") return <SkillsTab />;
    if (activeTab === "lead_stages") return <LeadStagesTab />;
    if (activeTab === "lead_large_segments") return <LeadSegmentsTab />;
    if (activeTab === "lead_score_rules") return (
      <LeadScoreRulesTab
        scoreMasters={{
          companySizes: leadCompanySizes,
          leadSources,
          leadStages: allLeadStages,
          leadStatuses: allLeadStatuses,
          leadCallStatuses,
          leadActivityTypes,
          leadCustomerActivityTypes,
          leadLargeSegments: allLeadLargeSegments,
          leadSmallSegments: allLeadSmallSegments,
        }}
      />
    );

    if (loadingData) return <p style={styles.sub}>読み込み中...</p>;

    switch (activeTab) {
      case "contract_types":
        return (
          <SimpleMasterTab
            title="契約種別"
            items={contractTypes}
            onCreate={createContractTypeAction}
            onUpdate={updateContractType}
            onDelete={deleteContractType}
            onRefresh={refreshContractTypes}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
            ]}
          />
        );
      case "corporate_types":
        return (
          <SimpleMasterTab
            title="法人格"
            items={corporateTypes}
            onCreate={createCorporateType}
            onUpdate={updateCorporateType}
            onDelete={deleteCorporateType}
            onRefresh={refreshCorporateTypes}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
            ]}
          />
        );
      case "company_statuses":
        return (
          <SimpleMasterTab
            title="事業者情報ステータス"
            items={companyStatuses}
            onCreate={createCompanyStatusAction}
            onUpdate={updateCompanyStatus}
            onDelete={deleteCompanyStatus}
            onRefresh={refreshCompanyStatuses}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
            ]}
          />
        );
      case "services":
        return (
          <SimpleMasterTab
            title="サービス"
            items={services}
            onCreate={createService}
            onUpdate={updateService}
            onDelete={deleteService}
            onRefresh={refreshServices}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
            ]}
          />
        );
      case "lead_sources":
        return (
          <SimpleMasterTab
            title="リードソース"
            items={leadSources}
            onCreate={createLeadSource}
            onUpdate={updateLeadSource}
            onDelete={deleteLeadSource}
            onRefresh={refreshLeadSources}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
            ]}
          />
        );
      case "lead_categories":
        return (
          <SimpleMasterTab
            title="リードカテゴリ"
            items={leadCategories}
            onCreate={createLeadCategory}
            onUpdate={updateLeadCategory}
            onDelete={deleteLeadCategory}
            onRefresh={refreshLeadCategories}
            fields={[
              { key: "code", label: "コード (例: inquiry)", type: "text" },
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "color", label: "カラー (#RRGGBB)", type: "text", colorSwatch: true },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "lead_temperatures":
        return (
          <SimpleMasterTab
            title="温度感"
            items={leadTemperatures}
            onCreate={createLeadTemperature}
            onUpdate={updateLeadTemperature}
            onDelete={deleteLeadTemperature}
            onRefresh={refreshLeadTemperatures}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "lead_call_statuses":
        return (
          <SimpleMasterTab
            title="コールステータス"
            items={leadCallStatuses}
            onCreate={createLeadCallStatus}
            onUpdate={updateLeadCallStatus}
            onDelete={deleteLeadCallStatus}
            onRefresh={refreshLeadCallStatuses}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "lead_activity_types":
        return (
          <SimpleMasterTab
            title="対応種別"
            items={leadActivityTypes}
            onCreate={createLeadActivityType}
            onUpdate={updateLeadActivityType}
            onDelete={deleteLeadActivityType}
            onRefresh={refreshLeadActivityTypes}
            fields={[
              { key: "code", label: "コード (例: call)", type: "text" },
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "color", label: "カラー (#RRGGBB)", type: "text", colorSwatch: true },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "account_types":
        return (
          <SimpleMasterTab
            title="取引先種別"
            items={accountTypes}
            onCreate={createAccountTypeAction}
            onUpdate={updateAccountType}
            onDelete={deleteAccountType}
            onRefresh={refreshAccountTypes}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
            ]}
          />
        );
      case "company_verification":
        return <CompanyVerificationPanel />;
      case "account_role_types":
        return (
          <SimpleMasterTab
            title="取引先区分"
            items={accountRoleTypes}
            onCreate={createAccountRoleType}
            onUpdate={updateAccountRoleType}
            onDelete={deleteAccountRoleType}
            onRefresh={refreshAccountRoleTypes}
            fields={[
              { key: "code", label: "コード (例: customer)", type: "text" },
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
              {
                // このパイプラインで契約が成立すると、取引先へ自動で付与される
                key: "pipeline_type_id",
                label: "自動付与するパイプライン",
                type: "select",
                options: [
                  { value: "", label: "（手動付与のみ）" },
                  ...pipelineTypes.map((p) => ({ value: p.id, label: p.name })),
                ],
              },
            ]}
          />
        );
      case "account_statuses":
        return (
          <SimpleMasterTab
            title="取引先ステータス"
            items={accountStatuses}
            onCreate={createAccountStatusAction}
            onUpdate={updateAccountStatus}
            onDelete={deleteAccountStatus}
            onRefresh={refreshAccountStatuses}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
            ]}
          />
        );
      case "contact_statuses":
        return (
          <SimpleMasterTab
            title="連絡先ステータス"
            items={contactStatuses}
            onCreate={createContactStatusAction}
            onUpdate={updateContactStatus}
            onDelete={deleteContactStatus}
            onRefresh={refreshContactStatuses}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
            ]}
          />
        );
      case "lead_company_sizes":
        return (
          <SimpleMasterTab
            title="企業規模"
            items={leadCompanySizes}
            onCreate={createLeadCompanySize}
            onUpdate={updateLeadCompanySize}
            onDelete={deleteLeadCompanySize}
            onRefresh={refreshLeadCompanySizes}
            fields={[
              { key: "code", label: "コード", type: "text" },
              { key: "name", label: "名前", type: "text" },
              { key: "min_employees", label: "従業員数（下限）", type: "number", min: 0 },
              { key: "max_employees", label: "従業員数（上限）", type: "number", min: 0 },
              { key: "min_capital", label: "資本金（下限・円）", type: "number", min: 0 },
              { key: "max_capital", label: "資本金（上限・円）", type: "number", min: 0 },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "lead_customer_activity_types":
        return (
          <SimpleMasterTab
            title="顧客行動タイプ"
            items={leadCustomerActivityTypes}
            onCreate={createLeadCustomerActivityType}
            onUpdate={updateLeadCustomerActivityType}
            onDelete={deleteLeadCustomerActivityType}
            onRefresh={refreshLeadCustomerActivityTypes}
            fields={[
              { key: "code", label: "コード", type: "text" },
              { key: "name", label: "名前", type: "text" },
              { key: "description", label: "説明", type: "textarea" },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "lead_score_thresholds":
        return <LeadScoreThresholdsTab leadTemperatures={leadTemperatures} />;
      case "project_statuses":
        return (
          <SimpleMasterTab
            title="プロジェクトステータス"
            items={projectStatuses}
            onCreate={createProjectStatus}
            onUpdate={updateProjectStatus}
            onDelete={deleteProjectStatus}
            onRefresh={refreshProjectStatuses}
            fields={[
              { key: "name", label: "名前", type: "text" },
              { key: "definition", label: "定義", type: "textarea" },
              { key: "sort_order", label: "表示順", type: "number" },
              { key: "color", label: "バッジ色 (#RRGGBB)", type: "text", colorSwatch: true },
            ]}
          />
        );
      default:
        return null;
    }
  };

  const currentGroup = GROUPS.find((g) => g.key === activeGroup) ?? GROUPS[0];

  return (
    <div>
      {/* Page title */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ ...styles.title, fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          マスタ管理
        </h1>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <a
            href="/admin/members"
            className="hover:bg-[var(--color-bg-hover)]"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              color: "var(--color-terra)",
              textDecoration: "none",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "1px solid var(--color-border-default)",
              transition: "background-color 0.15s",
            }}
          >
            社内メンバー
            <ArrowUpRight size={14} />
          </a>
          <a
            href="/admin/leads/import"
            className="hover:bg-[var(--color-bg-hover)]"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              color: "var(--color-terra)",
              textDecoration: "none",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "1px solid var(--color-border-default)",
              transition: "background-color 0.15s",
            }}
          >
            Eight 名刺データを取込
            <ArrowUpRight size={14} />
          </a>
          <a
            href="/admin/deleted"
            className="hover:bg-[var(--color-bg-hover)]"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              color: "var(--color-terra)",
              textDecoration: "none",
              padding: "0.375rem 0.75rem",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "1px solid var(--color-border-default)",
              transition: "background-color 0.15s",
            }}
          >
            削除済みレコードを管理
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>

      {/* === 上段: グループタブ === */}
      <div
        style={{
          display: "flex",
          gap: 0,
          overflowX: "auto",
          borderBottom: "1px solid var(--color-border-default)",
          marginBottom: 0,
        }}
      >
        {GROUPS.map((group) => (
          <GroupTabButton
            key={group.key}
            label={group.label}
            isActive={activeGroup === group.key}
            onClick={() => handleGroupChange(group.key)}
          />
        ))}
      </div>

      {/* === 下段: マスタタブ === */}
      <div
        style={{
          display: "flex",
          gap: 0,
          overflowX: "auto",
          borderBottom: "1px solid var(--color-border-default)",
          marginBottom: "1.5rem",
          backgroundColor: "var(--color-sumi50)",
          paddingLeft: "0.25rem",
        }}
      >
        {currentGroup.tabs.map((tabKey) => (
          <MasterTabButton
            key={tabKey}
            label={TAB_LABELS[tabKey]}
            isActive={activeTab === tabKey}
            onClick={() => setActiveTab(tabKey)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div style={{ ...styles.card, padding: "1.5rem" }}>
        {renderTab()}
      </div>
    </div>
  );
}

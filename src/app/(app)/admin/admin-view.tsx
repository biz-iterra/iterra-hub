"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  getPipelineTypes, createPipelineType, updatePipelineType, deletePipelineType,
  getDealStages, createDealStage, updateDealStage, deleteDealStage,
  getDealStatuses, createDealStatus, updateDealStatus, deleteDealStatus,
  getContractTypes, createContractTypeAction, updateContractType, deleteContractType,
  getCorporateTypes, createCorporateType, updateCorporateType, deleteCorporateType,
  getServices, createService, updateService, deleteService,
  getLeadSources, createLeadSource, updateLeadSource, deleteLeadSource,
  getAccountTypes, createAccountTypeAction, updateAccountType, deleteAccountType,
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
  getLeadCallers, createLeadCaller, updateLeadCaller, deleteLeadCaller,
  getLeadCallStatuses, createLeadCallStatus, updateLeadCallStatus, deleteLeadCallStatus,
  getLeadLargeSegments, createLeadLargeSegment, updateLeadLargeSegment, deleteLeadLargeSegment,
  getLeadSmallSegments, createLeadSmallSegment, updateLeadSmallSegment, deleteLeadSmallSegment,
} from "@/actions/masters";

// ===== Types =====

type FieldDef = { key: string; label: string; type?: "text" | "textarea" | "number" | "select"; options?: { value: string; label: string }[]; colorSwatch?: boolean; min?: number };

type MasterItem = Record<string, unknown> & { id: string; name: string };

// ===== Tab & Group definitions =====

const TAB_KEYS = [
  // 共通・取引
  "pipeline", "contract_types", "services",
  // カンパニー
  "corporate_types", "company_statuses",
  // アカウント
  "account_types", "account_statuses",
  // コンタクト
  "contact_statuses",
  // リード・MA（lead_statuses は lead_stages タブ内で管理、lead_small_segments は lead_large_segments タブ内で管理）
  "lead_sources", "lead_categories", "lead_stages",
  "lead_temperatures", "lead_callers", "lead_call_statuses",
  "lead_large_segments", "lead_activity_types",
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
  company_statuses: "カンパニーステータス",
  account_types: "アカウント種別",
  account_statuses: "アカウントステータス",
  contact_statuses: "コンタクトステータス",
  lead_sources: "リードソース",
  lead_categories: "リードカテゴリ",
  lead_stages: "ステージ・ステータス",
  lead_temperatures: "温度感",
  lead_callers: "担当者",
  lead_call_statuses: "コールステータス",
  lead_large_segments: "セグメント",
  lead_activity_types: "対応種別",
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
    label: "カンパニー",
    tabs: ["corporate_types", "company_statuses"],
  },
  {
    key: "account",
    label: "アカウント",
    tabs: ["account_types", "account_statuses"],
  },
  {
    key: "contact",
    label: "コンタクト",
    tabs: ["contact_statuses"],
  },
  {
    key: "lead",
    label: "リード・MA",
    tabs: [
      "lead_sources", "lead_categories",
      "lead_stages",        // ステージ + ステータスを 1 画面で管理
      "lead_temperatures", "lead_callers", "lead_call_statuses",
      "lead_large_segments", // 大セグメント + 小セグメントを 1 画面で管理
      "lead_activity_types",
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

// ===== Delete Confirm Modal =====

function DeleteConfirmModal({
  itemName,
  loading,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title="削除確認" onClose={onCancel}>
      <p style={{ ...styles.sub, marginBottom: "1.5rem" }}>
        「{itemName}」を本当に削除しますか？
      </p>
      <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
        <button style={styles.btnOutline} onClick={onCancel} disabled={loading}>
          キャンセル
        </button>
        <button style={styles.btnDanger} onClick={onConfirm} disabled={loading}>
          {loading ? "処理中..." : "削除"}
        </button>
      </div>
    </Modal>
  );
}

// ===== Form Modal =====

function FormModal({
  title,
  fields,
  initialValues,
  loading,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  fields: FieldDef[];
  initialValues: Record<string, unknown>;
  loading: boolean;
  error: string | null;
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
                  value={(values[field.key] as number) ?? 0}
                  min={field.min}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: parseInt(e.target.value) || 0 }))}
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
        {error && <p style={{ ...styles.error, marginTop: "0.75rem" }}>{error}</p>}
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
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<MasterItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<MasterItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (values: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    const result = await onCreate(values);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setShowCreate(false);
    onRefresh();
  };

  const handleUpdate = async (values: Record<string, unknown>) => {
    if (!editItem) return;
    setLoading(true);
    setError(null);
    const result = await onUpdate(editItem.id, values);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditItem(null);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setLoading(true);
    setError(null);
    const result = await onDelete(deleteItem.id);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDeleteItem(null);
    onRefresh();
  };

  const defaultValues: Record<string, unknown> = {};
  for (const f of fields) {
    defaultValues[f.key] = f.type === "number" ? 0 : "";
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ ...styles.title, fontSize: "1rem", fontWeight: 600 }}>{title}</h2>
        <button style={styles.btnPrimary} onClick={() => { setError(null); setShowCreate(true); }}>
          追加
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {fields.map((f) => (
                <th key={f.key} style={{ ...styles.tableHeader, textAlign: "left", padding: "0.75rem" }}>
                  {f.label}
                </th>
              ))}
              <th style={{ ...styles.tableHeader, textAlign: "right", padding: "0.75rem", width: 140 }}>
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
                    if (raw == null || raw === "") {
                      display = "-";
                    } else if (f.type === "select" && f.options) {
                      const opt = f.options.find((o) => o.value === raw);
                      display = opt?.label ?? String(raw);
                    } else {
                      display = String(raw);
                    }
                    return (
                      <td key={f.key} style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                        {display}
                      </td>
                    );
                  })}
                  <td style={{ padding: "0.75rem", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button
                        style={{ ...styles.btnOutline, ...styles.btnSmall }}
                        onClick={() => { setError(null); setEditItem(item); }}
                      >
                        編集
                      </button>
                      <button
                        style={{ ...styles.btnDanger, ...styles.btnSmall }}
                        onClick={() => { setError(null); setDeleteItem(item); }}
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
          error={error}
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
          error={error}
          onSubmit={handleUpdate}
          onCancel={() => setEditItem(null)}
        />
      )}

      {/* Delete Modal */}
      {deleteItem && (
        <DeleteConfirmModal
          itemName={deleteItem.name}
          loading={loading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteItem(null)}
        />
      )}
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
    { key: "description", label: "説明", type: "textarea" },
    { key: "sort_order", label: "表示順", type: "number" },
  ];

  const stageFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "current_situation", label: "現在の状況", type: "textarea" },
    { key: "sort_order", label: "表示順", type: "number" },
  ];

  const stageOptions = stages.map((s) => ({ value: s.id, label: s.name }));
  const statusFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "deal_stage_id", label: "ディールステージ", type: "select", options: stageOptions },
    { key: "sort_order", label: "表示順", type: "number" },
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
              title="ディールステージ"
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
              title="ディールステータス"
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
    { key: "sort_order", label: "表示順", type: "number" },
  ];

  const skillFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
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
    { key: "sort_order", label: "表示順", type: "number" },
  ];

  const stageOptions = [
    { value: "", label: "（未分類）" },
    ...stages.map((s) => ({ value: s.id, label: s.name })),
  ];
  const statusFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
    { key: "stage_id", label: "リードステージ", type: "select", options: stageOptions },
    { key: "sort_order", label: "表示順", type: "number" },
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
  ];

  const largeOptions = [
    { value: "", label: "（未分類）" },
    ...largeSegments.map((s) => ({ value: s.id, label: s.name })),
  ];
  const smallFields: FieldDef[] = [
    { key: "name", label: "名前", type: "text" },
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
  const [leadCallers, setLeadCallers] = useState<MasterItem[]>([]);
  const [leadCallStatuses, setLeadCallStatuses] = useState<MasterItem[]>([]);
  const [accountTypes, setAccountTypes] = useState<MasterItem[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<MasterItem[]>([]);
  const [contactStatuses, setContactStatuses] = useState<MasterItem[]>([]);
  const [companyStatuses, setCompanyStatuses] = useState<MasterItem[]>([]);
  const [projectStatuses, setProjectStatuses] = useState<MasterItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const loadAllSimpleMasters = useCallback(async () => {
    setLoadingData(true);
    const [ct, corp, svc, ls, lc, lat, ltemp, lcall, lcs, at, as_, cs, cps, ps] = await Promise.all([
      getContractTypes(),
      getCorporateTypes(),
      getServices(),
      getLeadSources(),
      getLeadCategories(),
      getLeadActivityTypes(),
      getLeadTemperatures(),
      getLeadCallers(),
      getLeadCallStatuses(),
      getAccountTypes(),
      getAccountStatuses(),
      getContactStatuses(),
      getCompanyStatuses(),
      getProjectStatusesMasters(),
    ]);
    setContractTypes((ct.data as MasterItem[]) ?? []);
    setCorporateTypes((corp.data as MasterItem[]) ?? []);
    setServices((svc.data as MasterItem[]) ?? []);
    setLeadSources((ls.data as MasterItem[]) ?? []);
    setLeadCategories((lc.data as MasterItem[]) ?? []);
    setLeadActivityTypes((lat.data as MasterItem[]) ?? []);
    setLeadTemperatures((ltemp.data as MasterItem[]) ?? []);
    setLeadCallers((lcall.data as MasterItem[]) ?? []);
    setLeadCallStatuses((lcs.data as MasterItem[]) ?? []);
    setAccountTypes((at.data as MasterItem[]) ?? []);
    setAccountStatuses((as_.data as MasterItem[]) ?? []);
    setContactStatuses((cs.data as MasterItem[]) ?? []);
    setCompanyStatuses((cps.data as MasterItem[]) ?? []);
    setProjectStatuses((ps.data as MasterItem[]) ?? []);
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
  const refreshLeadCallers = async () => {
    const r = await getLeadCallers();
    setLeadCallers((r.data as MasterItem[]) ?? []);
  };
  const refreshLeadCallStatuses = async () => {
    const r = await getLeadCallStatuses();
    setLeadCallStatuses((r.data as MasterItem[]) ?? []);
  };
  const refreshAccountTypes = async () => {
    const r = await getAccountTypes();
    setAccountTypes((r.data as MasterItem[]) ?? []);
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

  const renderTab = () => {
    // Special compound tabs
    if (activeTab === "pipeline") return <PipelineTab />;
    if (activeTab === "skills") return <SkillsTab />;
    if (activeTab === "lead_stages") return <LeadStagesTab />;
    if (activeTab === "lead_large_segments") return <LeadSegmentsTab />;

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
            fields={[{ key: "name", label: "名前", type: "text" }]}
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
            fields={[{ key: "name", label: "名前", type: "text" }]}
          />
        );
      case "company_statuses":
        return (
          <SimpleMasterTab
            title="カンパニーステータス"
            items={companyStatuses}
            onCreate={createCompanyStatusAction}
            onUpdate={updateCompanyStatus}
            onDelete={deleteCompanyStatus}
            onRefresh={refreshCompanyStatuses}
            fields={[{ key: "name", label: "名前", type: "text" }]}
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
              { key: "description", label: "説明", type: "textarea" },
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
              { key: "description", label: "説明", type: "textarea" },
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
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "lead_callers":
        return (
          <SimpleMasterTab
            title="担当者"
            items={leadCallers}
            onCreate={createLeadCaller}
            onUpdate={updateLeadCaller}
            onDelete={deleteLeadCaller}
            onRefresh={refreshLeadCallers}
            fields={[{ key: "name", label: "名前", type: "text" }]}
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
              { key: "color", label: "カラー (#RRGGBB)", type: "text", colorSwatch: true },
              { key: "sort_order", label: "表示順", type: "number", min: 0 },
            ]}
          />
        );
      case "account_types":
        return (
          <SimpleMasterTab
            title="アカウント種別"
            items={accountTypes}
            onCreate={createAccountTypeAction}
            onUpdate={updateAccountType}
            onDelete={deleteAccountType}
            onRefresh={refreshAccountTypes}
            fields={[{ key: "name", label: "名前", type: "text" }]}
          />
        );
      case "account_statuses":
        return (
          <SimpleMasterTab
            title="アカウントステータス"
            items={accountStatuses}
            onCreate={createAccountStatusAction}
            onUpdate={updateAccountStatus}
            onDelete={deleteAccountStatus}
            onRefresh={refreshAccountStatuses}
            fields={[{ key: "name", label: "名前", type: "text" }]}
          />
        );
      case "contact_statuses":
        return (
          <SimpleMasterTab
            title="コンタクトステータス"
            items={contactStatuses}
            onCreate={createContactStatusAction}
            onUpdate={updateContactStatus}
            onDelete={deleteContactStatus}
            onRefresh={refreshContactStatuses}
            fields={[{ key: "name", label: "名前", type: "text" }]}
          />
        );
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
              { key: "sort_order", label: "表示順", type: "number" },
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

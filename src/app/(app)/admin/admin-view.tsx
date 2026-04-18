"use client";

import { useState, useEffect, useCallback, type FormEvent } from "react";
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
  getSkillCategories, createSkillCategory, updateSkillCategory, deleteSkillCategory,
  getSkills, createSkill, updateSkill, deleteSkill,
} from "@/actions/masters";

// ===== Types =====

type FieldDef = { key: string; label: string; type?: "text" | "textarea" | "number" | "select"; options?: { value: string; label: string }[] };

type MasterItem = Record<string, unknown> & { id: string; name: string };

// ===== Tab definitions =====

const TAB_KEYS = [
  "pipeline", "contract_types", "corporate_types", "services",
  "lead_sources", "account_types", "account_statuses", "contact_statuses", "company_statuses", "skills",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  pipeline: "パイプライン",
  contract_types: "契約種別",
  corporate_types: "事業者種別",
  services: "サービス",
  lead_sources: "リードソース",
  account_types: "アカウント種別",
  account_statuses: "アカウントステータス",
  contact_statuses: "コンタクトステータス",
  company_statuses: "カンパニーステータス",
  skills: "スキル",
};

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
                    e.currentTarget.style.borderColor = "";
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
                    e.currentTarget.style.borderColor = "";
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
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: parseInt(e.target.value) || 0 }))}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-focus)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "";
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
                    e.currentTarget.style.borderColor = "";
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
                  {fields.map((f) => (
                    <td key={f.key} style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                      {String(item[f.key] ?? "-")}
                    </td>
                  ))}
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

// ===== Main AdminView =====

export function AdminView() {
  const [activeTab, setActiveTab] = useState<TabKey>("pipeline");

  // Data state for simple masters
  const [contractTypes, setContractTypes] = useState<MasterItem[]>([]);
  const [corporateTypes, setCorporateTypes] = useState<MasterItem[]>([]);
  const [services, setServices] = useState<MasterItem[]>([]);
  const [leadSources, setLeadSources] = useState<MasterItem[]>([]);
  const [accountTypes, setAccountTypes] = useState<MasterItem[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<MasterItem[]>([]);
  const [contactStatuses, setContactStatuses] = useState<MasterItem[]>([]);
  const [companyStatuses, setCompanyStatuses] = useState<MasterItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const loadAllSimpleMasters = useCallback(async () => {
    setLoadingData(true);
    const [ct, corp, svc, ls, at, as_, cs, cps] = await Promise.all([
      getContractTypes(),
      getCorporateTypes(),
      getServices(),
      getLeadSources(),
      getAccountTypes(),
      getAccountStatuses(),
      getContactStatuses(),
      getCompanyStatuses(),
    ]);
    setContractTypes((ct.data as MasterItem[]) ?? []);
    setCorporateTypes((corp.data as MasterItem[]) ?? []);
    setServices((svc.data as MasterItem[]) ?? []);
    setLeadSources((ls.data as MasterItem[]) ?? []);
    setAccountTypes((at.data as MasterItem[]) ?? []);
    setAccountStatuses((as_.data as MasterItem[]) ?? []);
    setContactStatuses((cs.data as MasterItem[]) ?? []);
    setCompanyStatuses((cps.data as MasterItem[]) ?? []);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    loadAllSimpleMasters();
  }, [loadAllSimpleMasters]);

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

  const renderTab = () => {
    if (activeTab === "pipeline") return <PipelineTab />;
    if (activeTab === "skills") return <SkillsTab />;

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
            title="事業者種別"
            items={corporateTypes}
            onCreate={createCorporateType}
            onUpdate={updateCorporateType}
            onDelete={deleteCorporateType}
            onRefresh={refreshCorporateTypes}
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
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Page title */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ ...styles.title, fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
          マスタ管理
        </h1>
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
          削除済みレコードを管理 →
        </a>
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: "0",
          overflowX: "auto",
          borderBottom: "1px solid var(--color-border-default)",
          marginBottom: "1.5rem",
        }}
      >
        {TAB_KEYS.map((key) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: "0.75rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--color-terra)" : "var(--color-sumi600)",
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
              {TAB_LABELS[key]}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ ...styles.card, padding: "1.5rem" }}>
        {renderTab()}
      </div>
    </div>
  );
}

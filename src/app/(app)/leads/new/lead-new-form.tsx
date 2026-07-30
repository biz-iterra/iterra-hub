"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createLead } from "@/actions/leads";

type SelectOption = { value: string; label: string };
type StatusOption = SelectOption & { stage_id: string };
type SmallSegmentOption = SelectOption & { large_segment_id: string | null };
type TempOption = SelectOption & { code: string };
type AccountTypeOption = SelectOption & { slug?: string | null };

type Masters = {
  stages: SelectOption[];
  statuses: StatusOption[];
  temperatures: TempOption[];
  sources: SelectOption[];
  accountTypes: AccountTypeOption[];
  largeSegments: SelectOption[];
  smallSegments: SmallSegmentOption[];
  owners: SelectOption[];
  categories: SelectOption[];
};

type CurrentUser = { id: string; full_name: string; role: string };

const styles = {
  container: { padding: "1.5rem", maxWidth: 960, margin: "0 auto" } as CSSProperties,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    marginBottom: "0.75rem",
  } as CSSProperties,
  title: { color: "var(--color-text-title)", fontSize: "1.5rem", fontWeight: 700, margin: 0 } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: { color: "var(--color-text-title)", fontSize: "1rem", fontWeight: 600, margin: "0 0 1rem 0" } as CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" } as CSSProperties,
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" } as CSSProperties,
  label: { display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sumi700)", marginBottom: "0.25rem" } as CSSProperties,
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
  helpText: { fontSize: "0.75rem", color: "var(--color-sumi500)", marginTop: "0.25rem" } as CSSProperties,
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
  error: { color: "var(--color-error)", fontSize: "0.875rem", margin: "0.75rem 0 0 0" } as CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "0.75rem",
    marginTop: "1rem",
  } as CSSProperties,
};

function onFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.boxShadow = "";
}

export function LeadNewForm({
  masters,
  currentUser,
}: {
  masters: Masters;
  currentUser: CurrentUser;
}) {
  const router = useRouter();
  const isManagerOrAbove = currentUser.role === "manager" || currentUser.role === "admin";

  const [values, setValues] = useState({
    lead_name: "",
    // 進捗セクション
    stage_id: "",
    status_id: "",
    category_id: "",
    // 企業情報セクション
    company_name: "",
    company_name_kana: "",
    representative_name: "",
    corporate_number: "",
    company_phone: "",
    url: "",
    employee_count: "",
    capital: "",
    // 担当者情報セクション
    contact_last_name: "",
    contact_middle_name: "",
    contact_first_name: "",
    contact_last_name_kana: "",
    contact_middle_name_kana: "",
    contact_first_name_kana: "",
    contact_department: "",
    contact_job_title: "",
    contact_email: "",
    contact_phone: "",
    // リード属性セクション
    large_segment_id: "",
    small_segment_id: "",
    lead_source_id: "",
    account_type_id: "",
    owner_user_id: currentUser.id,
  });
  // 副担当（主担当と別管理）
  const [subOwnerUserIds, setSubOwnerUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  // 主担当変更時: 新主担当が副担当に含まれていたら自動除外
  const handleOwnerChange = (newOwnerId: string) => {
    set("owner_user_id", newOwnerId);
    setSubOwnerUserIds((prev) => prev.filter((id) => id !== newOwnerId));
  };

  // 副担当チェックボックス操作
  const handleSubOwnerToggle = (userId: string, checked: boolean) => {
    if (checked) {
      setSubOwnerUserIds((prev) => [...prev, userId]);
    } else {
      setSubOwnerUserIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  // stage_id に応じて status の選択肢を Cascading filter
  const filteredStatuses = useMemo(
    () =>
      values.stage_id
        ? masters.statuses.filter((s) => s.stage_id === values.stage_id)
        : masters.statuses,
    [masters.statuses, values.stage_id]
  );

  // Opportunity ステージ判定
  const isOpportunityStage = useMemo(
    () =>
      values.stage_id
        ? (masters.stages as Array<SelectOption & { slug?: string }>).some(
            (s) => s.value === values.stage_id && s.slug === "opportunity"
          )
        : false,
    [masters.stages, values.stage_id]
  );

  // large_segment_id に応じて small_segment を絞り込み
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
  const handleCompanyNameChange = (companyName: string) => {
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarning(null);

    const employeeCountNum = values.employee_count.trim() === "" ? null : parseInt(values.employee_count, 10);
    if (employeeCountNum !== null && (Number.isNaN(employeeCountNum) || employeeCountNum < 0)) {
      setSaving(false);
      setError("従業員数は0以上の整数を入力してください");
      return;
    }
    const capitalNum = values.capital.trim() === "" ? null : parseFloat(values.capital);
    if (capitalNum !== null && (Number.isNaN(capitalNum) || capitalNum < 0)) {
      setSaving(false);
      setError("資本金は0以上の数値を入力してください");
      return;
    }

    const payload = {
      lead_name: values.lead_name,
      account_type_id: values.account_type_id,
      company_name: values.company_name || null,
      company_name_kana: values.company_name_kana || null,
      representative_name: values.representative_name || null,
      corporate_number: values.corporate_number || null,
      stage_id: values.stage_id,
      status_id: values.status_id || null,
      category_id: values.category_id || null,
      url: values.url || null,
      company_phone: values.company_phone || null,
      lead_source_id: values.lead_source_id || null,
      employee_count: employeeCountNum,
      capital: capitalNum,
      large_segment_id: values.large_segment_id || null,
      small_segment_id: values.small_segment_id || null,
      owner_user_id: values.owner_user_id,
      sub_owner_user_ids: subOwnerUserIds,
      contact_last_name: values.contact_last_name || null,
      contact_middle_name: values.contact_middle_name || null,
      contact_first_name: values.contact_first_name || null,
      contact_last_name_kana: values.contact_last_name_kana || null,
      contact_middle_name_kana: values.contact_middle_name_kana || null,
      contact_first_name_kana: values.contact_first_name_kana || null,
      contact_department: values.contact_department || null,
      contact_job_title: values.contact_job_title || null,
      contact_email: values.contact_email || null,
      contact_phone: values.contact_phone || null,
    };

    const result = await createLead(payload);
    setSaving(false);
    if (!result.ok) {
      const firstError = Object.values(result.errors).flat()[0] ?? "保存に失敗しました";
      setError(firstError);
      return;
    }

    // warnings がある場合は表示した上でリダイレクト
    if (result.warnings && result.warnings.length > 0) {
      setWarning(result.warnings[0]);
      // warnings がある場合もリダイレクトは行う（作成自体は成功）
    }

    const newId = (result.lead as { id?: string } | null)?.id;
    if (newId) {
      router.push(`/leads/${newId}`);
    } else {
      router.push("/leads");
    }
    router.refresh();
  };

  return (
    <div style={styles.container}>
      <Link
        href="/leads"
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
        リード一覧に戻る
      </Link>
      <div className="flex items-center justify-between mb-6">
        <h1 style={styles.title}>リードを新規作成</h1>
      </div>

      {warning && (
        <div
          style={{
            backgroundColor: "rgba(229,196,127,0.2)",
            border: "1px solid var(--color-amber)",
            borderRadius: "var(--radius-card)",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            color: "#8A6D1E",
            fontSize: "0.875rem",
          }}
        >
          <strong>確認が必要な項目があります:</strong> {warning}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* リード名 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>リード名</h2>
          <div>
            <label style={styles.label}>リード名 *</label>
            <input
              type="text"
              style={styles.input}
              value={values.lead_name}
              onChange={(e) => set("lead_name", e.target.value)}
              required
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>
        </div>

        {/* ① 進捗セクション */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>進捗</h2>
          <div style={{ ...styles.grid2, marginBottom: "1rem" }}>
            <div>
              <label style={styles.label}>ステージ *</label>
              <select
                style={styles.input}
                value={values.stage_id}
                onChange={(e) => handleStageChange(e.target.value)}
                required
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
            </div>
            <div>
              <label style={styles.label}>ステータス *</label>
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
                  required={!isOpportunityStage}
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
              {!values.stage_id && (
                <p style={styles.helpText}>ステージを先に選択してください</p>
              )}
              {isOpportunityStage && (
                <p style={{ ...styles.helpText, color: "var(--color-terra)" }}>
                  このステージでは商談が自動生成されます
                </p>
              )}
            </div>
          </div>
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

        {/* ② 企業情報セクション */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>企業情報</h2>
          <div style={{ ...styles.grid2, marginBottom: "1rem" }}>
            <div>
              <label style={styles.label}>会社名</label>
              <input
                type="text"
                style={styles.input}
                value={values.company_name}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                placeholder="フリーテキスト（DB未登録企業の仮入力用）"
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <p style={styles.helpText}>Opportunity 昇格時に自動で会社情報が作成されます</p>
            </div>
            <div>
              <label style={styles.label}>フリガナ</label>
              <input
                type="text"
                style={styles.input}
                value={values.company_name_kana}
                onChange={(e) => set("company_name_kana", e.target.value)}
                placeholder="カブシキガイシャ〇〇"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>代表者名</label>
              <input
                type="text"
                style={styles.input}
                value={values.representative_name}
                onChange={(e) => set("representative_name", e.target.value)}
                placeholder="山田 太郎"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>法人番号</label>
              <input
                type="text"
                style={styles.input}
                value={values.corporate_number}
                onChange={(e) => set("corporate_number", e.target.value)}
                placeholder="1234567890123"
                maxLength={13}
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <p style={styles.helpText}>13桁の数字で入力してください</p>
            </div>
            <div>
              <label style={styles.label}>代表電話</label>
              <input
                type="tel"
                style={styles.input}
                value={values.company_phone}
                onChange={(e) => set("company_phone", e.target.value)}
                placeholder="03-0000-0000"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>企業URL</label>
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
          </div>
          <p style={{ ...styles.helpText, marginBottom: "1rem" }}>
            企業規模は資本金と従業員数から自動判定されます。スコアは保存後に自動計算されます。
          </p>
          <div style={styles.grid3}>
            <div>
              <label style={styles.label}>従業員数</label>
              <input
                type="number"
                min={0}
                style={styles.input}
                value={values.employee_count}
                onChange={(e) => set("employee_count", e.target.value)}
                placeholder="例: 50"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>資本金（円）</label>
              <input
                type="number"
                min={0}
                style={styles.input}
                value={values.capital}
                onChange={(e) => set("capital", e.target.value)}
                placeholder="例: 5000000"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>企業規模（自動判定）</label>
              <div
                style={{
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-input)",
                  padding: "0.5rem 0.75rem",
                  backgroundColor: "var(--color-sumi50)",
                  fontSize: "0.875rem",
                  color: "var(--color-sumi400)",
                  minHeight: "2.375rem",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                保存後に自動設定
              </div>
              <p style={styles.helpText}>保存後に従業員数・資本金から自動更新されます</p>
            </div>
          </div>
        </div>

        {/* ③ 担当者情報セクション */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>担当者情報</h2>
          <div style={{ ...styles.grid3, marginBottom: "1rem" }}>
            <div>
              <label style={styles.label}>姓</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_last_name}
                onChange={(e) => set("contact_last_name", e.target.value)}
                placeholder="山田"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>ミドルネーム</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_middle_name}
                onChange={(e) => set("contact_middle_name", e.target.value)}
                placeholder="例: Smith"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>名</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_first_name}
                onChange={(e) => set("contact_first_name", e.target.value)}
                placeholder="太郎"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
          <div style={{ ...styles.grid3, marginBottom: "1rem" }}>
            <div>
              <label style={styles.label}>姓（カナ）</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_last_name_kana}
                onChange={(e) => set("contact_last_name_kana", e.target.value)}
                placeholder="ヤマダ"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>ミドル（カナ）</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_middle_name_kana}
                onChange={(e) => set("contact_middle_name_kana", e.target.value)}
                placeholder="スミス"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>名（カナ）</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_first_name_kana}
                onChange={(e) => set("contact_first_name_kana", e.target.value)}
                placeholder="タロウ"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
          <div style={{ ...styles.grid2, marginBottom: "1rem" }}>
            <div>
              <label style={styles.label}>部署</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_department}
                onChange={(e) => set("contact_department", e.target.value)}
                placeholder="営業部"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>役職</label>
              <input
                type="text"
                style={styles.input}
                value={values.contact_job_title}
                onChange={(e) => set("contact_job_title", e.target.value)}
                placeholder="部長"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
          <div style={styles.grid2}>
            <div>
              <label style={styles.label}>メール</label>
              <input
                type="email"
                style={styles.input}
                value={values.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
                placeholder="example@company.com"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>担当者電話</label>
              <input
                type="tel"
                style={styles.input}
                value={values.contact_phone}
                onChange={(e) => set("contact_phone", e.target.value)}
                placeholder="090-0000-0000"
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* ④ リード属性セクション */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>リード属性</h2>
          <div style={{ ...styles.grid3, marginBottom: "1rem" }}>
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
          <div style={styles.grid3}>
            <div>
              <label style={styles.label}>事業者種別 *</label>
              <select
                style={styles.input}
                value={values.account_type_id}
                onChange={(e) => set("account_type_id", e.target.value)}
                required
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.accountTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>社内担当者（主）*</label>
              <select
                style={styles.input}
                value={values.owner_user_id}
                onChange={(e) => handleOwnerChange(e.target.value)}
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
              {!isManagerOrAbove && (
                <p style={styles.helpText}>member は自分のみ担当者に設定できます</p>
              )}
            </div>
          </div>
          {/* 副担当 Multi-select */}
          <div>
            <label style={styles.label}>社内担当者（副）</label>
            {masters.owners.filter((u) => u.value !== values.owner_user_id).length === 0 ? (
              <p style={styles.helpText}>主担当以外のユーザーがいません</p>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-input)",
                  backgroundColor: "#fff",
                }}
              >
                {masters.owners
                  .filter((u) => u.value !== values.owner_user_id)
                  .map((u) => {
                    const checked = subOwnerUserIds.includes(u.value);
                    return (
                      <label
                        key={u.value}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.375rem",
                          padding: "0.25rem 0.625rem",
                          borderRadius: "var(--radius-badge)",
                          backgroundColor: checked
                            ? "rgba(60,63,88,0.12)"
                            : "var(--color-sumi100)",
                          color: checked ? "var(--color-terra)" : "var(--color-sumi600)",
                          fontSize: "0.8125rem",
                          fontWeight: checked ? 600 : 400,
                          cursor: "pointer",
                          border: checked
                            ? "1px solid rgba(60,63,88,0.25)"
                            : "1px solid transparent",
                          transition: "background-color 0.15s, color 0.15s",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => handleSubOwnerToggle(u.value, e.target.checked)}
                          style={{ accentColor: "var(--color-terra)", width: "0.875rem", height: "0.875rem" }}
                        />
                        {u.label}
                      </label>
                    );
                  })}
              </div>
            )}
            <p style={styles.helpText}>副担当者を複数選択できます（任意）</p>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.footer}>
          <Link
            href="/leads"
            style={{ ...styles.btnOutline, textDecoration: "none" }}
          >
            キャンセル
          </Link>
          <button type="submit" style={styles.btnPrimary} disabled={saving}>
            <Save size={14} />
            {saving ? "作成中..." : "作成"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Thermometer } from "lucide-react";
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
  callers: SelectOption[];
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
    account_type_id: "",
    company_name: "",
    stage_id: "",
    status_id: "",
    category_id: "",
    temperature_id: "",
    score: "",
    url: "",
    phone: "",
    lead_source_id: "",
    large_segment_id: "",
    small_segment_id: "",
    primary_caller_id: "",
    owner_user_id: currentUser.id,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  // stage_id に応じて status の選択肢を Cascading filter
  const filteredStatuses = useMemo(
    () =>
      values.stage_id
        ? masters.statuses.filter((s) => s.stage_id === values.stage_id)
        : masters.statuses,
    [masters.statuses, values.stage_id]
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

    const scoreNum =
      values.score.trim() === "" ? null : parseInt(values.score, 10);
    if (scoreNum !== null && (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100)) {
      setSaving(false);
      setError("スコアは 0〜100 の整数を入力してください");
      return;
    }

    const payload = {
      lead_name: values.lead_name,
      account_type_id: values.account_type_id,
      company_name: values.company_name || null,
      stage_id: values.stage_id,
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
      owner_user_id: values.owner_user_id,
    };

    const result = await createLead(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const newId = (result.data as { id?: string } | null)?.id;
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

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div style={{ ...styles.grid2, marginBottom: "1rem" }}>
            <div style={{ gridColumn: "1 / -1" }}>
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
              <label style={styles.label}>企業名（仮）</label>
              <input
                type="text"
                style={styles.input}
                value={values.company_name}
                onChange={(e) => handleCompanyNameChange(e.target.value)}
                placeholder="フリーテキスト（DB未登録企業の仮入力用）"
                onFocus={onFocus}
                onBlur={onBlur}
              />
              <p style={styles.helpText}>Opportunity 昇格時に自動で Company が作成されます</p>
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
              <label style={styles.label}>担当者 *</label>
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
              {!isManagerOrAbove && (
                <p style={styles.helpText}>member は自分のみ担当者に設定できます</p>
              )}
            </div>
          </div>
        </div>

        {/* ステージ・ステータス（Cascading）*/}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>ステージ・ステータス</h2>
          <div style={styles.grid2}>
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
              <select
                style={styles.input}
                value={values.status_id}
                onChange={(e) => set("status_id", e.target.value)}
                required
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
              {!values.stage_id && (
                <p style={styles.helpText}>ステージを先に選択してください</p>
              )}
            </div>
          </div>
        </div>

        {/* カテゴリ */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>カテゴリ</h2>
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
          <h2 style={styles.sectionTitle}>スコア・温度感</h2>
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
              <p style={{ ...styles.helpText, display: "flex", alignItems: "center", gap: "0.25rem" }}>
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
                <option value="">-- 未選択（スコアから自動判定）--</option>
                {masters.temperatures.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p style={styles.helpText}>スコア入力時は自動上書きされます</p>
            </div>
          </div>
        </div>

        {/* 主担・セグメント */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>主担・セグメント</h2>
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

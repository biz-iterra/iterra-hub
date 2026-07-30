"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  UserCircle,
  Star,
  Briefcase,
  GraduationCap,
  Award,
  Wrench,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { SystemTagBadge, GradeBadge, LabelBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { addTalentAchievement, removeTalentAchievement } from "@/actions/talent-classification";
import type { TalentProfileResult } from "@/lib/talent-classification";
import type {
  TalentAchievementMaster,
  TalentAchievementWithMaster,
} from "@/lib/validators/talent-classification";

type Tab = "basic" | "skills" | "job_type" | "career";

// ---- 型定義（getTalent の select 構造に対応）----

type DiagnosisMaster = {
  type?: string | null;
  animal?: string | null;
  character?: string | null;
  rhythm?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  dominant_brain?: string | null;
  brain_characteristics?: string | null;
  three_classification?: string | null;
};

type ConstellationMaster = {
  constellation?: string | null;
  element?: string | null;
  nature?: string | null;
  element_description?: string | null;
  nature_description?: string | null;
  characteristics?: string | null;
  keywords?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
};

type TalentSkillRow = {
  id: string;
  proficiency_level: number | null;
  years_experience: number | null;
  note: string | null;
  skill: {
    id: string;
    skill_code: string | null;
    axis: string | null;
    name: string;
    system_tags: string[] | null;
    skill_categories: { name: string } | null;
  } | null;
};

type TalentCareerRow = {
  id: string;
  career_type: string;
  organization: string | null;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  sort_order: number;
};

export type TalentDetail = {
  id: string;
  personality_memo: string | null;
  custom_strengths: string | null;
  custom_weaknesses: string | null;
  aptitude_notes: string | null;
  overall_assessment: string | null;
  contact: {
    id: string;
    contact_code: string | null;
    last_name: string;
    first_name: string | null;
    department: string | null;
    job_title: string | null;
    number_diagnosis: DiagnosisMaster | null;
    constellation_fortune_telling: ConstellationMaster | null;
  } | null;
  talent_skills: TalentSkillRow[] | null;
  talent_careers: TalentCareerRow[] | null;
};

// ---- ヘルパーコンポーネント ----

function DiagnosisBlock({
  label,
  value,
  span2 = false,
}: {
  label: string;
  value: string;
  span2?: boolean;
}) {
  return (
    <div style={{ gridColumn: span2 ? "1 / -1" : undefined }}>
      <div
        style={{
          color: "var(--color-sumi600)",
          fontSize: "0.75rem",
          fontWeight: 600,
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "var(--color-text-body)",
          fontSize: "0.875rem",
          whiteSpace: "pre-wrap",
          lineHeight: 1.5,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          color: "var(--color-sumi600)",
          fontSize: "0.75rem",
          fontWeight: 600,
          marginBottom: "0.125rem",
        }}
      >
        {label}
      </div>
      {emphasis ? (
        <span
          style={{
            display: "inline-block",
            backgroundColor: "var(--color-terra)",
            color: "#fff",
            borderRadius: "var(--radius-badge)",
            padding: "0.125rem 0.5rem",
            fontSize: "0.75rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {value}
        </span>
      ) : (
        <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
          {value}
        </div>
      )}
    </div>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ja-JP");
}

function CareerTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "work":
      return <Briefcase size={16} />;
    case "education":
      return <GraduationCap size={16} />;
    case "certification":
      return <Award size={16} />;
    default:
      return <Briefcase size={16} />;
  }
}

const card: CSSProperties = {
  backgroundColor: "var(--color-bg-surface)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--elevation-low)",
  padding: "1.5rem",
  marginBottom: "1.5rem",
};

const cardTitle: CSSProperties = {
  color: "var(--color-text-title)",
  fontSize: "1rem",
  fontWeight: 600,
  margin: "0 0 1rem 0",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const emptyText: CSSProperties = {
  color: "var(--color-sumi500)",
  fontSize: "0.875rem",
};

// ── 職種タブ用コンポーネント ────────────────────────────────────────────────────

/**
 * カテゴリ → 固定色マップ（feedback_badge_placement 準拠・LabelBadge 経由）
 * キーは talent_job_types.category の実値（seed-talent-classification.sql）と一致させる。
 */
const JOB_CATEGORY_COLORS: Record<string, string> = {
  エンジニア:     "#2563EB",
  情シス:         "#1E40AF",
  デザイナー:     "#7C3AED",
  クリエイター:   "#6B21A8",
  "PM/リード":    "#0F766E",
  営業:           "#B85A3F",
  コーポレート:   "#8A6D1E",
};

function JobTypeTabContent({
  talentId,
  profile,
  achievements,
  achievementsMaster,
  userRole,
}: {
  talentId: string;
  profile: TalentProfileResult | null;
  achievements: TalentAchievementWithMaster[];
  achievementsMaster: TalentAchievementMaster[];
  userRole: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [addCode, setAddCode] = useState<string>("");
  const [addDate, setAddDate] = useState<string>("");
  const [addNote, setAddNote] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const canEdit = userRole === "admin" || userRole === "manager";

  // 一覧はサーバから渡る props を正とし、更新後は router.refresh() で再取得する
  const ownedCodes = new Set(achievements.map((a) => a.achievement_code));
  const unownedMaster = achievementsMaster.filter(
    (m) => !ownedCodes.has(m.achievement_code)
  );

  const handleAdd = () => {
    if (!addCode) return;
    startTransition(async () => {
      const result = await addTalentAchievement({
        talent_id: talentId,
        achievement_code: addCode,
        achieved_at: addDate || null,
        note: addNote || null,
      });
      if (result.error) {
        showToast({ type: "error", message: result.error });
        return;
      }
      showToast({ type: "success", message: "実績を追加しました" });
      setAddCode("");
      setAddDate("");
      setAddNote("");
      router.refresh();
    });
  };

  const handleRemove = (achievementId: string) => {
    startTransition(async () => {
      const result = await removeTalentAchievement(achievementId);
      if (result.error) {
        showToast({ type: "error", message: result.error });
        return;
      }
      showToast({ type: "success", message: "実績を削除しました" });
      router.refresh();
    });
  };

  // マスタ未投入時の表示（systems が空 = 系統マスタが 1 件も無い）
  if (!profile || profile.systems.length === 0) {
    return (
      <div style={{ ...card, textAlign: "center", padding: "2.5rem 1.5rem" }}>
        <p style={emptyText}>
          分類マスタが未登録のため、プロファイルを算定できません。
        </p>
        <p
          style={{
            color: "var(--color-sumi500)",
            fontSize: "0.8125rem",
            marginTop: "0.5rem",
          }}
        >
          talent_system_tags / talent_grades / talent_grade_requirements /
          talent_job_types を登録してください。
        </p>
      </div>
    );
  }

  const matchedSystems = profile.systems.filter((s) => s.matched);

  return (
    <div>
      {/* ── 系統サマリ ── */}
      <div style={card}>
        <h2 style={cardTitle}>
          <Award size={18} />
          系統（System）
        </h2>

        {matchedSystems.length === 0 ? (
          <p style={emptyText}>
            合致する系統がありません（スキルレベルが不足しています）
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "0.25rem",
            }}
          >
            {profile.systems.map((sys) => {
              if (!sys.matched) return null;
              return (
                <SystemTagBadge
                  key={sys.system_code}
                  code={sys.system_code}
                  name={sys.name}
                  primary={profile.primary_system === sys.system_code}
                />
              );
            })}
          </div>
        )}

        {profile.primary_system && (
          <p
            style={{
              color: "var(--color-sumi500)",
              fontSize: "0.75rem",
              margin: "0.5rem 0 0 0",
            }}
          >
            プライマリ系統（最上位グレード）:{" "}
            <strong style={{ color: "var(--color-sumi700)" }}>
              {
                profile.systems.find(
                  (s) => s.system_code === profile.primary_system
                )?.name
              }
            </strong>
          </p>
        )}
      </div>

      {/* ── グレード（系統ごと） ── */}
      {matchedSystems.length > 0 && (
        <div style={card}>
          <h2 style={cardTitle}>
            <Star size={18} />
            グレード（Grade）
          </h2>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}
          >
            {profile.grades
              .filter((g) => g.grade_code !== null)
              .map((gr) => {
                const sysName = profile.systems.find(
                  (s) => s.system_code === gr.system_code
                )?.name ?? gr.system_code;
                return (
                  <div key={gr.system_code}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <SystemTagBadge
                        code={gr.system_code}
                        name={sysName}
                        primary={profile.primary_system === gr.system_code}
                      />
                      <GradeBadge gradeCode={gr.grade_code} />
                    </div>

                    {gr.grade_info?.expected_role && (
                      <div style={{ marginBottom: "0.375rem" }}>
                        <span
                          style={{
                            color: "var(--color-sumi600)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          期待役割:{" "}
                        </span>
                        <span
                          style={{
                            color: "var(--color-text-body)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {gr.grade_info.expected_role}
                        </span>
                      </div>
                    )}

                    {gr.grade_info?.evaluation_points && (
                      <div style={{ marginBottom: "0.375rem" }}>
                        <span
                          style={{
                            color: "var(--color-sumi600)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          評価ポイント:{" "}
                        </span>
                        <span
                          style={{
                            color: "var(--color-text-body)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {gr.grade_info.evaluation_points}
                        </span>
                      </div>
                    )}

                    {gr.unmet_achievements.length > 0 && (
                      <div>
                        <span
                          style={{
                            color: "var(--color-sumi600)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          次グレードへの不足条件:{" "}
                        </span>
                        <span
                          style={{
                            color: "var(--color-sumi500)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          {gr.unmet_achievements.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── 適合職種 ── */}
      <div style={card}>
        <h2 style={cardTitle}>
          <Briefcase size={18} />
          適合職種
        </h2>

        {profile.job_types.length === 0 ? (
          <p style={emptyText}>スキル要件を満たす職種がありません</p>
        ) : (
          <div>
            {/* カテゴリ別グルーピング */}
            {Object.entries(
              profile.job_types.reduce(
                (acc: Record<string, typeof profile.job_types>, jt) => {
                  const cat = jt.category ?? "その他";
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(jt);
                  return acc;
                },
                {}
              )
            ).map(([category, jts]) => (
              <div key={category} style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.375rem",
                  }}
                >
                  {category}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                  {jts.map((jt) => (
                    <LabelBadge
                      key={jt.job_type_code}
                      name={jt.name}
                      color={
                        JOB_CATEGORY_COLORS[jt.category ?? ""] ?? null
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 実績管理 ── */}
      <div style={card}>
        <h2 style={cardTitle}>
          <Award size={18} />
          実績（Achievement）
        </h2>

        {achievements.length === 0 ? (
          <p style={{ ...emptyText, marginBottom: "1rem" }}>
            登録済みの実績はありません
          </p>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1rem" }}
          >
            {achievements.map((ach) => {
              const name =
                ach.master?.name ??
                achievementsMaster.find(
                  (m) => m.achievement_code === ach.achievement_code
                )?.name ??
                ach.achievement_code;
              return (
                <div
                  key={ach.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.375rem 0",
                    borderBottom: "1px solid var(--color-border-default)",
                  }}
                >
                  <div>
                    <span
                      style={{
                        color: "var(--color-text-body)",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        color: "var(--color-sumi500)",
                        fontSize: "0.75rem",
                        fontFamily: "monospace",
                      }}
                    >
                      {ach.achievement_code}
                    </span>
                    {ach.achieved_at && (
                      <span
                        style={{
                          marginLeft: "0.5rem",
                          color: "var(--color-sumi500)",
                          fontSize: "0.75rem",
                        }}
                      >
                        {new Date(ach.achieved_at).toLocaleDateString("ja-JP")}
                      </span>
                    )}
                    {ach.note && (
                      <div
                        style={{
                          color: "var(--color-sumi500)",
                          fontSize: "0.75rem",
                          marginTop: "0.125rem",
                        }}
                      >
                        {ach.note}
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleRemove(ach.id)}
                      disabled={isPending}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: "none",
                        border: "none",
                        color: "var(--color-sumi500)",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        padding: "0.25rem 0.375rem",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <Trash2 size={13} />
                      削除
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 実績追加フォーム（admin/manager のみ） */}
        {canEdit && unownedMaster.length > 0 && (
          <div
            style={{
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--color-border-default)",
            }}
          >
            <div
              style={{
                color: "var(--color-sumi700)",
                fontSize: "0.8125rem",
                fontWeight: 600,
                marginBottom: "0.625rem",
              }}
            >
              実績を追加
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: "0.5rem",
                alignItems: "end",
              }}
            >
              <div>
                <select
                  value={addCode}
                  onChange={(e) => setAddCode(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.375rem 0.5rem",
                    fontSize: "0.875rem",
                    border: "1px solid var(--color-border-default)",
                    borderRadius: "var(--radius-input)",
                    backgroundColor: "var(--color-bg-surface)",
                    color: "var(--color-text-body)",
                    outline: "none",
                  }}
                >
                  <option value="">-- 実績を選択 --</option>
                  {unownedMaster.map((m) => (
                    <option key={m.achievement_code} value={m.achievement_code}>
                      {m.name}（{m.achievement_code}）
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  placeholder="達成日（任意）"
                  style={{
                    padding: "0.375rem 0.5rem",
                    fontSize: "0.875rem",
                    border: "1px solid var(--color-border-default)",
                    borderRadius: "var(--radius-input)",
                    backgroundColor: "var(--color-bg-surface)",
                    color: "var(--color-text-body)",
                    outline: "none",
                  }}
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={!addCode || isPending}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  backgroundColor:
                    addCode && !isPending
                      ? "var(--color-terra)"
                      : "var(--color-sumi200)",
                  color: addCode && !isPending ? "#fff" : "var(--color-sumi500)",
                  border: "none",
                  borderRadius: "var(--radius-button)",
                  padding: "0.375rem 0.75rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: addCode && !isPending ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={14} />
                追加
              </button>
            </div>
            {addNote !== undefined && (
              <input
                type="text"
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                placeholder="メモ（任意）"
                style={{
                  marginTop: "0.375rem",
                  width: "100%",
                  padding: "0.375rem 0.5rem",
                  fontSize: "0.875rem",
                  border: "1px solid var(--color-border-default)",
                  borderRadius: "var(--radius-input)",
                  backgroundColor: "var(--color-bg-surface)",
                  color: "var(--color-text-body)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── メインコンポーネント ────────────────────────────────────────────────────────

export function TalentDetailClient({
  talent,
  profile,
  achievements,
  achievementsMaster,
  userRole,
}: {
  talent: TalentDetail;
  profile: TalentProfileResult | null;
  achievements: TalentAchievementWithMaster[];
  achievementsMaster: TalentAchievementMaster[];
  userRole: string | null;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("basic");

  const contact = talent.contact;
  const contactName = contact
    ? `${contact.last_name} ${contact.first_name}`
    : "—";

  const numberDiagnosis = contact?.number_diagnosis;
  const constellation = contact?.constellation_fortune_telling;
  const hasFortuneData = numberDiagnosis || constellation;

  const sortedSkills = [...(talent.talent_skills ?? [])].sort(
    (a, b) => (b.proficiency_level ?? 0) - (a.proficiency_level ?? 0)
  );

  // カテゴリ別グルーピング
  const skillsByCategory = sortedSkills.reduce<Record<string, TalentSkillRow[]>>(
    (acc, ts) => {
      const cat = ts.skill?.skill_categories?.name ?? "未分類";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(ts);
      return acc;
    },
    {}
  );

  const careers = talent.talent_careers ?? [];

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
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/talents"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-sumi600)",
            fontSize: "0.875rem",
            textDecoration: "none",
            marginBottom: "0.5rem",
            padding: "0.125rem 0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <ArrowLeft size={16} />
          タレント一覧
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <h1
            style={{
              color: "var(--color-text-title)",
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {contactName}
          </h1>
          <Link
            href={`/talents/${talent.id}/edit`}
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              backgroundColor: "var(--color-terra)",
              color: "#fff",
              borderRadius: "var(--radius-button)",
              padding: "0.5rem 1rem",
              textDecoration: "none",
              fontWeight: 500,
              fontSize: "0.875rem",
            }}
          >
            <Pencil size={14} />
            編集
          </Link>
        </div>
        {(contact?.department || contact?.job_title) && (
          <p
            style={{
              color: "var(--color-sumi600)",
              fontSize: "0.875rem",
              margin: "0.25rem 0 0 0",
            }}
          >
            {[contact.department, contact.job_title].filter(Boolean).join(" / ")}
          </p>
        )}
      </div>

      {/* タブバー */}
      <div
        style={{
          borderBottom: "1px solid var(--color-border-default)",
          marginBottom: "1.5rem",
          display: "flex",
          gap: 0,
        }}
      >
        {(
          [
            { key: "basic", label: "基本性質", icon: UserCircle },
            { key: "skills", label: "スキル", icon: Wrench },
            { key: "job_type", label: "職種", icon: Briefcase },
            { key: "career", label: "経歴", icon: GraduationCap },
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

      {/* ===== 基本性質タブ ===== */}
      {activeTab === "basic" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "1.5rem",
            alignItems: "start",
          }}
        >
          {/* 左カラム */}
          <div>
            {/* 診断結果（自動）カード */}
            {(numberDiagnosis?.strengths ||
              numberDiagnosis?.weaknesses ||
              constellation?.strengths ||
              constellation?.weaknesses ||
              constellation?.characteristics ||
              constellation?.keywords ||
              constellation?.element_description ||
              constellation?.nature_description) && (
              <div style={card}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "0.25rem",
                  }}
                >
                  <h2
                    style={{
                      ...cardTitle,
                      margin: 0,
                    }}
                  >
                    <Star size={18} />
                    診断結果（自動）
                  </h2>
                  <span
                    style={{
                      color: "var(--color-sumi600)",
                      fontSize: "0.6875rem",
                      backgroundColor: "var(--color-sumi100)",
                      borderRadius: "var(--radius-badge)",
                      padding: "0.125rem 0.5rem",
                    }}
                  >
                    生年月日から算出
                  </span>
                </div>
                <p
                  style={{
                    color: "var(--color-sumi500)",
                    fontSize: "0.75rem",
                    margin: "0 0 1rem 0",
                  }}
                >
                  下記は診断マスタの定型値です。個別の評価は下の手入力項目を参照してください。
                </p>

                {(numberDiagnosis?.strengths || numberDiagnosis?.weaknesses) && (
                  <div
                    style={{
                      paddingBottom: "1rem",
                      marginBottom: "1rem",
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                  >
                    <div
                      style={{
                        color: "var(--color-sumi700)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        marginBottom: "0.5rem",
                      }}
                    >
                      ポテンシャルタイプ
                      {numberDiagnosis?.type && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            backgroundColor: "var(--color-terra)",
                            color: "#fff",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                          }}
                        >
                          {numberDiagnosis.type}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                      }}
                    >
                      {numberDiagnosis?.strengths && (
                        <DiagnosisBlock
                          label="強み"
                          value={numberDiagnosis.strengths}
                        />
                      )}
                      {numberDiagnosis?.weaknesses && (
                        <DiagnosisBlock
                          label="弱み"
                          value={numberDiagnosis.weaknesses}
                        />
                      )}
                    </div>
                  </div>
                )}

                {(constellation?.strengths ||
                  constellation?.weaknesses ||
                  constellation?.characteristics ||
                  constellation?.keywords ||
                  constellation?.element_description ||
                  constellation?.nature_description) && (
                  <div>
                    <div
                      style={{
                        color: "var(--color-sumi700)",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        marginBottom: "0.5rem",
                      }}
                    >
                      星座
                      {constellation?.constellation && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            backgroundColor: "var(--color-sage)",
                            color: "#fff",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                          }}
                        >
                          {constellation.constellation}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                      }}
                    >
                      {constellation?.characteristics && (
                        <DiagnosisBlock
                          label="特徴"
                          value={constellation.characteristics}
                          span2
                        />
                      )}
                      {constellation?.keywords && (
                        <DiagnosisBlock
                          label="キーワード"
                          value={constellation.keywords}
                          span2
                        />
                      )}
                      {constellation?.element_description && (
                        <DiagnosisBlock
                          label="エレメント特性"
                          value={constellation.element_description}
                        />
                      )}
                      {constellation?.nature_description && (
                        <DiagnosisBlock
                          label="性質特性"
                          value={constellation.nature_description}
                        />
                      )}
                      {constellation?.strengths && (
                        <DiagnosisBlock
                          label="強み"
                          value={constellation.strengths}
                        />
                      )}
                      {constellation?.weaknesses && (
                        <DiagnosisBlock
                          label="弱み"
                          value={constellation.weaknesses}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 性格分析カード */}
            {talent.personality_memo && (
              <div style={card}>
                <h2 style={cardTitle}>
                  <UserCircle size={18} />
                  性格分析
                </h2>
                <div
                  style={{
                    color: "var(--color-text-body)",
                    fontSize: "0.875rem",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {talent.personality_memo}
                </div>
              </div>
            )}

            {/* 強み・弱みカード */}
            {(talent.custom_strengths || talent.custom_weaknesses) && (
              <div style={card}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "1rem",
                  }}
                >
                  <h2 style={{ ...cardTitle, margin: 0 }}>
                    <Star size={18} />
                    強み・弱み
                  </h2>
                  <span
                    style={{
                      color: "var(--color-sumi600)",
                      fontSize: "0.6875rem",
                      backgroundColor: "var(--color-sumi100)",
                      borderRadius: "var(--radius-badge)",
                      padding: "0.125rem 0.5rem",
                    }}
                  >
                    手入力
                  </span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1.5rem",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "var(--color-sumi600)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        marginBottom: "0.5rem",
                      }}
                    >
                      強み
                    </div>
                    <div
                      style={{
                        color: "var(--color-text-body)",
                        fontSize: "0.875rem",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {talent.custom_strengths ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        color: "var(--color-sumi600)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        marginBottom: "0.5rem",
                      }}
                    >
                      弱み
                    </div>
                    <div
                      style={{
                        color: "var(--color-text-body)",
                        fontSize: "0.875rem",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                      }}
                    >
                      {talent.custom_weaknesses ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 適性メモカード */}
            {talent.aptitude_notes && (
              <div style={card}>
                <h2 style={cardTitle}>適性メモ</h2>
                <div
                  style={{
                    color: "var(--color-text-body)",
                    fontSize: "0.875rem",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {talent.aptitude_notes}
                </div>
              </div>
            )}

            {/* 総合評価カード */}
            {talent.overall_assessment && (
              <div style={card}>
                <h2 style={cardTitle}>総合評価</h2>
                <div
                  style={{
                    color: "var(--color-text-body)",
                    fontSize: "0.875rem",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.6,
                  }}
                >
                  {talent.overall_assessment}
                </div>
              </div>
            )}
          </div>

          {/* 右カラム */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* 連絡先情報カード */}
            <div style={{ ...card, marginBottom: 0 }}>
              <h2 style={cardTitle}>
                <UserCircle size={18} />
                連絡先情報
              </h2>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
              >
                <div>
                  <div
                    style={{
                      color: "var(--color-sumi600)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      marginBottom: "0.125rem",
                    }}
                  >
                    連絡先名
                  </div>
                  {contact ? (
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="hover:bg-[var(--color-bg-hover)]"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        color: "var(--color-terra)",
                        textDecoration: "none",
                        padding: "0.125rem 0.375rem",
                        margin: "-0.125rem -0.375rem",
                        borderRadius: "var(--radius-sm)",
                        transition: "background-color 0.15s",
                        fontSize: "0.875rem",
                      }}
                    >
                      {contactName}
                      <ArrowUpRight size={14} />
                    </Link>
                  ) : (
                    <div
                      style={{
                        color: "var(--color-text-body)",
                        fontSize: "0.875rem",
                      }}
                    >
                      —
                    </div>
                  )}
                </div>
                {contact?.department && (
                  <div>
                    <div
                      style={{
                        color: "var(--color-sumi600)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        marginBottom: "0.125rem",
                      }}
                    >
                      部署
                    </div>
                    <div
                      style={{
                        color: "var(--color-text-body)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {contact.department}
                    </div>
                  </div>
                )}
                {contact?.job_title && (
                  <div>
                    <div
                      style={{
                        color: "var(--color-sumi600)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        marginBottom: "0.125rem",
                      }}
                    >
                      役職
                    </div>
                    <div
                      style={{
                        color: "var(--color-text-body)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {contact.job_title}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 占い情報カード */}
            {hasFortuneData && (
              <div style={{ ...card, marginBottom: 0 }}>
                <h2 style={cardTitle}>
                  <Star size={18} />
                  占い情報
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  {numberDiagnosis?.type && (
                    <InfoRow
                      label="ポテンシャルタイプ"
                      value={numberDiagnosis.type}
                      emphasis
                    />
                  )}
                  {numberDiagnosis?.dominant_brain && (
                    <InfoRow
                      label="優位脳"
                      value={numberDiagnosis.dominant_brain}
                    />
                  )}
                  {numberDiagnosis?.brain_characteristics && (
                    <InfoRow
                      label="脳特徴"
                      value={numberDiagnosis.brain_characteristics}
                    />
                  )}
                  {numberDiagnosis?.animal && (
                    <InfoRow label="動物占い" value={numberDiagnosis.animal} />
                  )}
                  {numberDiagnosis?.character && (
                    <InfoRow
                      label="キャラクター"
                      value={numberDiagnosis.character}
                    />
                  )}
                  {numberDiagnosis?.rhythm && (
                    <InfoRow label="リズム" value={numberDiagnosis.rhythm} />
                  )}
                  {numberDiagnosis?.three_classification && (
                    <InfoRow
                      label="3分類"
                      value={numberDiagnosis.three_classification}
                    />
                  )}
                  {constellation?.constellation && (
                    <InfoRow label="星座" value={constellation.constellation} />
                  )}
                  {constellation?.element && (
                    <InfoRow
                      label="エレメント"
                      value={constellation.element}
                    />
                  )}
                  {constellation?.nature && (
                    <InfoRow label="性質" value={constellation.nature} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== スキルタブ ===== */}
      {activeTab === "skills" && (
        <div>
          {sortedSkills.length === 0 ? (
            <div
              style={{
                ...card,
                textAlign: "center",
                padding: "2.5rem 1.5rem",
              }}
            >
              <p style={emptyText}>スキルが登録されていません</p>
            </div>
          ) : (
            Object.entries(skillsByCategory).map(([categoryName, skills]) => (
              <div key={categoryName} style={card}>
                <h2 style={cardTitle}>
                  <Wrench size={18} />
                  {categoryName}
                </h2>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  {skills.map((ts) => {
                    const level = ts.proficiency_level ?? 0;
                    const isHighLevel = level >= 4;
                    return (
                      <div
                        key={ts.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.375rem 0",
                          borderBottom:
                            "1px solid var(--color-border-default)",
                        }}
                      >
                        <div
                          style={{
                            color: "var(--color-text-body)",
                            fontSize: "0.875rem",
                          }}
                        >
                          {ts.skill?.name ?? "—"}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          {ts.years_experience != null && (
                            <span
                              style={{
                                color: "var(--color-sumi600)",
                                fontSize: "0.75rem",
                              }}
                            >
                              {ts.years_experience}年
                            </span>
                          )}
                          <span
                            style={{
                              display: "inline-block",
                              borderRadius: "var(--radius-badge)",
                              padding: "0.125rem 0.5rem",
                              fontSize: "0.75rem",
                              backgroundColor: isHighLevel
                                ? "var(--color-sage)"
                                : "var(--color-sumi100)",
                              color: isHighLevel ? "#fff" : undefined,
                            }}
                          >
                            Lv.{level}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== 職種タブ ===== */}
      {activeTab === "job_type" && (
        <JobTypeTabContent
          talentId={talent.id}
          profile={profile}
          achievements={achievements}
          achievementsMaster={achievementsMaster}
          userRole={userRole}
        />
      )}

      {/* ===== 経歴タブ ===== */}
      {activeTab === "career" && (
        <div>
          {careers.length === 0 ? (
            <div
              style={{
                ...card,
                textAlign: "center",
                padding: "2.5rem 1.5rem",
              }}
            >
              <p style={emptyText}>経歴が登録されていません</p>
            </div>
          ) : (
            <div style={card}>
              <h2 style={cardTitle}>
                <GraduationCap size={18} />
                経歴
              </h2>
              <div
                style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
              >
                {careers.map((career) => (
                  <div
                    key={career.id}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                      paddingBottom: "1rem",
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                  >
                    <div
                      style={{
                        color: "var(--color-sumi600)",
                        marginTop: "0.125rem",
                        flexShrink: 0,
                      }}
                    >
                      <CareerTypeIcon type={career.career_type} />
                    </div>
                    <div>
                      <div
                        style={{
                          color: "var(--color-text-body)",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                        }}
                      >
                        {career.organization ?? "—"}
                      </div>
                      {career.title && (
                        <div
                          style={{
                            color: "var(--color-sumi600)",
                            fontSize: "0.75rem",
                            marginTop: "0.125rem",
                          }}
                        >
                          {career.title}
                        </div>
                      )}
                      <div
                        style={{
                          color: "var(--color-sumi600)",
                          fontSize: "0.75rem",
                          marginTop: "0.125rem",
                        }}
                      >
                        {formatDate(career.start_date)}
                        {career.start_date && " 〜 "}
                        {career.end_date
                          ? formatDate(career.end_date)
                          : career.start_date
                          ? "現在"
                          : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

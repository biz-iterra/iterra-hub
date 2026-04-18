import { getTalent } from "@/actions/talents";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  UserCircle,
  Star,
  Briefcase,
  GraduationCap,
  Award,
  Pencil,
} from "lucide-react";

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("ja-JP");
}

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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TalentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          不正なパラメータです
        </p>
        <Link
          href="/talents"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          タレント一覧へ戻る
        </Link>
      </div>
    );
  }

  const { data: talent, error } = await getTalent(id);

  if (error || !talent) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          タレントが見つかりません
        </p>
        <Link
          href="/talents"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-sumi600)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          タレント一覧へ戻る
        </Link>
      </div>
    );
  }

  const contact = talent.contact;
  const contactName = contact
    ? `${contact.last_name} ${contact.first_name}`
    : "—";

  const numberDiagnosis = contact?.number_diagnosis;
  const constellation = contact?.constellation_fortune_telling;
  const hasFortuneData = numberDiagnosis || constellation;

  const sortedSkills = [...(talent.talent_skills ?? [])].sort(
    (a: any, b: any) => (b.proficiency_level ?? 0) - (a.proficiency_level ?? 0)
  );

  const careers = talent.talent_careers ?? [];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/talents"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-sumi600)",
            fontSize: "0.875rem",
            textDecoration: "none",
            marginBottom: "0.5rem",
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

      {/* 2カラム */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* 左カラム */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* 診断結果（自動）カード - DB書換なし、ポテンシャルタイプ・星座マスタから表示 */}
          {(numberDiagnosis?.strengths ||
            numberDiagnosis?.weaknesses ||
            constellation?.strengths ||
            constellation?.weaknesses ||
            constellation?.characteristics ||
            constellation?.keywords ||
            constellation?.element_description ||
            constellation?.nature_description) && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
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
                    color: "var(--color-text-title)",
                    fontSize: "1rem",
                    fontWeight: 600,
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
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
              <p style={{ color: "var(--color-sumi500)", fontSize: "0.75rem", margin: "0 0 1rem 0" }}>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {numberDiagnosis?.strengths && (
                      <DiagnosisBlock label="強み" value={numberDiagnosis.strengths} />
                    )}
                    {numberDiagnosis?.weaknesses && (
                      <DiagnosisBlock label="弱み" value={numberDiagnosis.weaknesses} />
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {constellation?.characteristics && (
                      <DiagnosisBlock
                        label="特徴"
                        value={constellation.characteristics}
                        span2
                      />
                    )}
                    {constellation?.keywords && (
                      <DiagnosisBlock label="キーワード" value={constellation.keywords} span2 />
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
                      <DiagnosisBlock label="強み" value={constellation.strengths} />
                    )}
                    {constellation?.weaknesses && (
                      <DiagnosisBlock label="弱み" value={constellation.weaknesses} />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 性格分析カード */}
          {talent.personality_memo && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
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
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "1rem",
                }}
              >
                <h2
                  style={{
                    color: "var(--color-text-title)",
                    fontSize: "1rem",
                    fontWeight: 600,
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
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
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  marginBottom: "1rem",
                }}
              >
                適性メモ
              </h2>
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
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  marginBottom: "1rem",
                }}
              >
                総合評価
              </h2>
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
          {/* コンタクト情報カード */}
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "var(--radius-card)",
              boxShadow: "var(--elevation-low)",
              padding: "1.5rem",
            }}
          >
            <h2
              style={{
                color: "var(--color-text-title)",
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: "1rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <UserCircle size={18} />
              コンタクト情報
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.125rem",
                  }}
                >
                  コンタクト名
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
                  <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
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
                  <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
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
                  <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                    {contact.job_title}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 占い情報カード */}
          {hasFortuneData && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Star size={18} />
                占い情報
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {numberDiagnosis?.type && (
                  <InfoRow label="ポテンシャルタイプ" value={numberDiagnosis.type} emphasis />
                )}
                {numberDiagnosis?.dominant_brain && (
                  <InfoRow label="優位脳" value={numberDiagnosis.dominant_brain} />
                )}
                {numberDiagnosis?.brain_characteristics && (
                  <InfoRow label="脳特徴" value={numberDiagnosis.brain_characteristics} />
                )}
                {numberDiagnosis?.animal && (
                  <InfoRow label="動物占い" value={numberDiagnosis.animal} />
                )}
                {numberDiagnosis?.character && (
                  <InfoRow label="キャラクター" value={numberDiagnosis.character} />
                )}
                {numberDiagnosis?.rhythm && (
                  <InfoRow label="リズム" value={numberDiagnosis.rhythm} />
                )}
                {numberDiagnosis?.three_classification && (
                  <InfoRow label="3分類" value={numberDiagnosis.three_classification} />
                )}
                {constellation?.constellation && (
                  <InfoRow label="星座" value={constellation.constellation} />
                )}
                {constellation?.element && (
                  <InfoRow label="エレメント" value={constellation.element} />
                )}
                {constellation?.nature && (
                  <InfoRow label="性質" value={constellation.nature} />
                )}
              </div>
            </div>
          )}

          {/* スキルカード */}
          {sortedSkills.length > 0 && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Briefcase size={18} />
                スキル
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {sortedSkills.map((ts: any) => {
                  const level = ts.proficiency_level ?? 0;
                  const isHighLevel = level >= 4;
                  const categoryName = ts.skill?.skill_categories?.name;
                  return (
                    <div
                      key={ts.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                        {ts.skill?.name ?? "—"}
                        {categoryName && (
                          <span
                            style={{
                              color: "var(--color-sumi600)",
                              fontSize: "0.75rem",
                              marginLeft: "0.25rem",
                            }}
                          >
                            ({categoryName})
                          </span>
                        )}
                      </div>
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
                  );
                })}
              </div>
            </div>
          )}

          {/* 経歴カード */}
          {careers.length > 0 && (
            <div
              style={{
                backgroundColor: "#fff",
                borderRadius: "var(--radius-card)",
                boxShadow: "var(--elevation-low)",
                padding: "1.5rem",
              }}
            >
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  marginBottom: "1rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Briefcase size={18} />
                経歴
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {careers.map((career: any) => (
                  <div
                    key={career.id}
                    style={{
                      display: "flex",
                      gap: "0.75rem",
                      alignItems: "flex-start",
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
                        {career.end_date ? formatDate(career.end_date) : career.start_date ? "現在" : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

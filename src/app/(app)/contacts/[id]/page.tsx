import { getContact } from "@/actions/contacts";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  Layers,
  Mail,
  Pencil,
  Sparkles,
  Star,
  StickyNote,
  User,
} from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { LabelBadge } from "@/components/ui/badges";
import { EntityLink } from "@/components/ui/EntityLink";

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("ja-JP");
}

const contactTypeLabel: Record<string, string> = {
  individual: "個人",
  corporate_rep: "法人代表",
  employee: "従業員",
  other: "その他",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const backLinkStyle = {
  display: "inline-flex" as const,
  alignItems: "center" as const,
  gap: "0.25rem",
  color: "var(--color-sumi600)",
  fontSize: "0.875rem",
  textDecoration: "none",
};

const editButtonStyle = {
  marginLeft: "auto",
  display: "inline-flex" as const,
  alignItems: "center" as const,
  gap: "0.375rem",
  backgroundColor: "var(--color-terra)",
  color: "#fff",
  borderRadius: "var(--radius-button)",
  padding: "0.5rem 1rem",
  textDecoration: "none",
  fontWeight: 500,
  fontSize: "0.875rem",
};

const badgeStyle = {
  backgroundColor: "var(--color-sumi100)",
  borderRadius: "var(--radius-badge)",
  padding: "0.125rem 0.5rem",
  fontSize: "0.75rem",
  color: "var(--color-text-body)",
};

const roleBadgeStyle = {
  ...badgeStyle,
  fontSize: "0.625rem",
  color: "var(--color-sumi600)",
};

export default async function ContactDetailPage({
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
        <Link href="/contacts" style={backLinkStyle}>
          <ArrowLeft size={16} />
          連絡先一覧
        </Link>
      </div>
    );
  }

  const { data: contact, error } = await getContact(id);
  const c = contact;

  if (error || !c) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          連絡先が見つかりません
        </p>
        <Link href="/contacts" style={backLinkStyle}>
          <ArrowLeft size={16} />
          連絡先一覧
        </Link>
      </div>
    );
  }

  const emails = c.contact_emails ?? [];
  const phones = c.contact_phones ?? [];
  const accountContacts = c.account_contacts ?? [];
  // contacts : talents は 1 対 1（talents.contact_id に unique 制約）
  const talent = c.talent;
  const talentSkills = talent?.talent_skills ?? [];
  const talentCareers = talent?.talent_careers ?? [];
  const address = [c.prefecture, c.city, c.address_line1, c.address_line2]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1280px", margin: "0 auto" }}>
      {/* ---- Header ---- */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/contacts" style={{ ...backLinkStyle, marginBottom: "0.75rem" }}>
          <ArrowLeft size={16} />
          連絡先一覧
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginTop: "0.5rem",
          }}
        >
          {c.contact_code && (
            <span
              style={{
                color: "var(--color-sumi600)",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {c.contact_code}
            </span>
          )}
          <h1
            style={{
              color: "var(--color-text-title)",
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: 0,
            }}
          >
            {c.last_name} {c.first_name ?? ""}
          </h1>
          <Link href={`/contacts/${c.id}/edit`} style={editButtonStyle}>
            <Pencil size={14} />
            編集
          </Link>
        </div>
      </div>

      {/* ---- 8:2 Grid ---- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "8fr 2fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ======== Left ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <DetailSection title="基本情報" icon={User}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="姓" value={c.last_name} />
              <InfoField label="名" value={c.first_name} />
              <InfoField label="フリガナ（姓）" value={c.last_name_kana} />
              <InfoField label="フリガナ（名）" value={c.first_name_kana} />
              <InfoField label="部署" value={c.department} />
              <InfoField label="役職" value={c.job_title} />
            </div>
          </DetailSection>

          <DetailSection title="属性情報" icon={Layers}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="ステータス" value={c.contact_status?.name} />
              <InfoField
                label="種別"
                value={
                  c.contact_type ? contactTypeLabel[c.contact_type] ?? "—" : "—"
                }
              />
              <InfoField
                label="所属法人情報"
                value={
                  c.company ? (
                    <EntityLink href={`/companies/${c.company.id}`}>
                      {c.company.name}
                    </EntityLink>
                  ) : null
                }
              />
            </div>
          </DetailSection>

          <DetailSection title="プロファイル" icon={Sparkles}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="生年月日" value={formatDate(c.birth_date)} />
              <InfoField
                label="血液型"
                value={c.blood_type ? `${c.blood_type} 型` : null}
              />
              <InfoField
                label="星座"
                value={c.constellation_fortune_telling?.constellation}
              />
              <InfoField
                label="ポテンシャルタイプ"
                value={c.number_diagnosis?.type}
              />
            </div>
          </DetailSection>

          <DetailSection title="連絡先" icon={Mail}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <InfoField
                label="メール"
                value={
                  emails.length === 0 ? null : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {emails.map((e) => (
                        <div
                          key={e.id}
                          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                        >
                          {e.is_primary && (
                            <Star size={12} style={{ color: "var(--color-terra)" }} />
                          )}
                          <span style={roleBadgeStyle}>{e.label ?? "main"}</span>
                          <span>{e.email}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
              />
              <InfoField
                label="電話"
                value={
                  phones.length === 0 ? null : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                      {phones.map((p) => (
                        <div
                          key={p.id}
                          style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                        >
                          {p.is_primary && (
                            <Star size={12} style={{ color: "var(--color-terra)" }} />
                          )}
                          <span style={roleBadgeStyle}>{p.label ?? "main"}</span>
                          <span>{p.phone}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <InfoField
                  label="郵便番号"
                  value={c.postal_code ? `〒${c.postal_code}` : null}
                />
                <InfoField label="住所" value={address} />
              </div>
            </div>
          </DetailSection>

          <DetailSection title="インボイス" icon={FileText}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField
                label="登録有無"
                value={c.invoice_registration_number ? "登録済み" : "未登録"}
              />
              <InfoField
                label="登録番号"
                value={c.invoice_registration_number}
              />
            </div>
          </DetailSection>

          {c.internal_memo && (
            <DetailSection title="メモ" icon={StickyNote}>
              <InfoField label="社内メモ" value={c.internal_memo} />
            </DetailSection>
          )}
        </div>

        {/* ======== Right ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <DetailSection title="所属取引先" icon={Briefcase}>
            {accountContacts.length === 0 ? (
              <p
                style={{
                  color: "var(--color-sumi400)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                —
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {accountContacts.map((ac) => (
                  <div
                    key={ac.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    {ac.account?.account_code && (
                      <span
                        style={{
                          display: "block",
                          color: "var(--color-sumi500)",
                          fontSize: "0.6875rem",
                          fontFamily: "monospace",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {ac.account.account_code}
                      </span>
                    )}
                    <EntityLink href={`/accounts/${ac.account?.id}`} compact>
                      {ac.account?.name ?? "—"}
                    </EntityLink>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          {talent && (
            <DetailSection title="タレント情報" icon={Star}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <EntityLink href={`/talents/${talent.id}`} compact>
                  タレント詳細
                </EntityLink>
                {talent.personality_memo && (
                  <InfoField label="性格分析メモ" value={talent.personality_memo} />
                )}
                {(talent.custom_strengths || talent.custom_weaknesses) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                    <InfoField label="強み" value={talent.custom_strengths} />
                    <InfoField label="弱み" value={talent.custom_weaknesses} />
                  </div>
                )}
                {talent.aptitude_notes && (
                  <InfoField label="適性メモ" value={talent.aptitude_notes} />
                )}
                {talent.overall_assessment && (
                  <InfoField label="総合評価" value={talent.overall_assessment} />
                )}
                {talentSkills.length > 0 && (
                  <InfoField
                    label="スキル"
                    value={
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                        {talentSkills.map((ts) => (
                          <LabelBadge
                            key={ts.id ?? ts.skill?.id}
                            name={
                              (ts.skill?.name ?? "") +
                              (ts.proficiency_level != null ? ` Lv.${ts.proficiency_level}` : "") +
                              (ts.years_experience != null ? `（${ts.years_experience}年）` : "")
                            }
                          />
                        ))}
                      </div>
                    }
                  />
                )}
                {talentCareers.length > 0 && (
                  <InfoField
                    label="経歴"
                    value={
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {talentCareers.map((career) => (
                          <div
                            key={career.id}
                            style={{
                              borderBottom: "1px solid var(--color-border-default)",
                              paddingBottom: "0.5rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.375rem",
                                marginBottom: "0.125rem",
                                flexWrap: "wrap",
                              }}
                            >
                              {career.career_type && (
                                <span style={roleBadgeStyle}>{career.career_type}</span>
                              )}
                              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                                {career.organization ?? "—"}
                              </span>
                              {career.title && (
                                <span
                                  style={{
                                    color: "var(--color-sumi600)",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  / {career.title}
                                </span>
                              )}
                            </div>
                            <span
                              style={{
                                color: "var(--color-sumi600)",
                                fontSize: "0.75rem",
                              }}
                            >
                              {formatDate(career.start_date)} ~{" "}
                              {career.is_current ? "現在" : formatDate(career.end_date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    }
                  />
                )}
              </div>
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
}

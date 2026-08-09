import { getContact, updateContact } from "@/actions/contacts";
import { getCompanies } from "@/actions/companies";
import { accountContactRoleLabel } from "@/lib/account-contact-roles";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { buildCompanyOptions } from "@/lib/company-options";
import { RelationField } from "@/components/ui/RelationField";
import { getContactEmailMessages } from "@/actions/email-sync";
import { EmailHistorySection } from "@/components/contacts/EmailHistorySection";
import { BusinessCardsSection } from "@/components/contacts/BusinessCardsSection";
import { ReferredContactsSection } from "@/components/contacts/ReferredContactsSection";
import { getReferredContacts } from "@/actions/business-cards";
import { AddressList } from "@/components/common/AddressesEditor";
import { getEntityAddresses } from "@/actions/entity-addresses";
import {
  getContactSocialAccounts,
  getSocialServices,
} from "@/actions/contact-social-accounts";
import { SocialLinks } from "@/components/contacts/SocialLinks";
import { getDeals } from "@/actions/deals";
import { AddRelatedLink } from "@/components/ui/AddRelatedLink";
import { isCounterpartyRole } from "@/lib/account-contact-roles";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Handshake,
  Layers,
  Mail,
  Pencil,
  Sparkles,
  Star,
  StickyNote,
  User,
} from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { CompanyAffiliationsSection } from "@/components/contacts/CompanyAffiliationsSection";
import { InfoField } from "@/components/ui/InfoField";
import { ExternalLinkText } from "@/components/ui/ExternalLinkText";
import { LabelBadge, StatusBadge } from "@/components/ui/badges";
import { EntityLink } from "@/components/ui/EntityLink";
import { detailContainerClass, detailGridClass, fieldGridClass, sectionStackClass } from "@/lib/layout";

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

  const [
    { data: contact, error },
    { data: emailMessagesRaw },
    { data: addressRows },
    { data: referredRows },
    { data: companiesResult },
    { data: users },
    { data: me },
    { data: socialServices },
    { data: socialAccounts },
    { data: contactDealsPage },
  ] = await Promise.all([
    getContact(id),
    getContactEmailMessages(id),
    getEntityAddresses("contact", id),
    getReferredContacts(id),
    // 紐づけの付け替え用。編集ページと同じ範囲を出す
    getCompanies({ perPage: 1000 }),
    getCrmUsers(),
    getCurrentUser(),
    getSocialServices(),
    getContactSocialAccounts(id),
    // 契約前のディールは連絡先に紐づくことがある（database-design.md §16）
    getDeals({ contactId: id, perPage: 50 }),
  ]);
  const contactDeals = contactDealsPage?.rows ?? [];
  const emailMessages = emailMessagesRaw ?? [];
  const addresses = addressRows ?? [];
  const referred = referredRows ?? [];
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

  // 紐づけの付け替え。編集ページ側からは外してあり、ここが唯一の入口になる。
  // 権限は updateContact でも見ているが、押せない方が分かりやすいので出し分ける
  const canEdit = me?.role === "admin" || c.owner_user_id === me?.id;
  const companyOptions = buildCompanyOptions(companiesResult?.rows ?? [], c.company);
  const ownerOptions = (users ?? []).map((u) => ({ value: u.id, label: u.full_name }));
  /**
   * 兼務先に選べるもの。**主たる所属と、既に兼務にある事業者は出さない**
   * （DB のトリガーが拒むので、押せてからエラーになるより出さない方がよい）
   */
  const alreadyLinked = new Set(
    [c.company_id, ...(c.company_contacts ?? []).map((a) => a.company_id)].filter(
      (v): v is string => Boolean(v)
    )
  );
  const affiliationOptions = companyOptions.filter(
    (o) => o.value !== "" && !alreadyLinked.has(o.value)
  );

  /** 楽観ロックに使う updated_at は、この画面を出した時点の値で閉じ込める */
  async function saveRelation(field: "company_id" | "owner_user_id", value: string | null) {
    "use server";
    const { error: saveError } = await updateContact(id, {
      [field]: value,
      expected_updated_at: c?.updated_at ?? undefined,
    });
    return { error: saveError };
  }

  const emails = c.contact_emails ?? [];
  const phones = c.contact_phones ?? [];
  // 「窓口」として出すのは担当者か請求者に入っているものだけ（2026-08-04）。
  // 取引先側は担当者情報・請求者情報の 2 セクションで管理しており、
  // どちらにも入っていない紐づけを窓口として見せると実態と食い違う
  const accountContacts = (c.account_contacts ?? []).filter((ac) =>
    isCounterpartyRole(ac.role)
  );
  // contacts : talents は 1 対 1（talents.contact_id に unique 制約）
  const talent = c.talent;
  const talentSkills = talent?.talent_skills ?? [];
  const talentCareers = talent?.talent_careers ?? [];

  return (
    <div className={detailContainerClass}>
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
            {/* ミドルネームを落とすと外国人名が別人の表記になる */}
            {[c.last_name, c.middle_name, c.first_name].filter(Boolean).join(" ")}
          </h1>
          <Link href={`/contacts/${c.id}/edit`} style={editButtonStyle}>
            <Pencil size={14} />
            編集
          </Link>
        </div>
      </div>

      {/* ---- 8:2 Grid ---- */}
      <div
        className={detailGridClass}
      >
        {/* ======== Left ======== */}
        <div className={sectionStackClass}>
          <DetailSection title="基本情報" icon={User}>
            <div
              className={fieldGridClass}
            >
              <InfoField label="姓" value={c.last_name} />
              <InfoField label="名" value={c.first_name} />
              <InfoField label="ミドルネーム" value={c.middle_name} />
              <InfoField label="フリガナ（ミドル）" value={c.middle_name_kana} />
              <InfoField label="フリガナ（姓）" value={c.last_name_kana} />
              <InfoField label="フリガナ（名）" value={c.first_name_kana} />
              <InfoField label="部署" value={c.department} />
              <InfoField label="役職" value={c.job_title} />
            </div>
            {/* 住所は連絡手段ではなく所在の情報なので基本情報に置く */}
            <div style={{ marginTop: "1rem" }}>
              <InfoField label="住所" value={<AddressList addresses={addresses} />} />
            </div>
          </DetailSection>

          {/* 連絡手段は使う頻度が高いので基本情報のすぐ下に置く */}
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
              {/*
                SNS・チャットの連絡口。使えるサービスを全部並べ、登録があるものだけ
                色を付ける。誰にどの手段で連絡できるかが一目で分かるように。
              */}
              <InfoField
                label="SNS・チャット"
                value={
                  <SocialLinks
                    services={socialServices ?? []}
                    accounts={socialAccounts ?? []}
                  />
                }
              />
              {/* 住所は基本情報へ移した（ここは連絡手段だけを扱う） */}
            </div>
          </DetailSection>

          <DetailSection title="属性情報" icon={Layers}>
            <div
              className={fieldGridClass}
            >
              <InfoField
                label="ステータス"
                value={
                  c.contact_status ? (
                    <StatusBadge
                      name={c.contact_status.name}
                      color={c.contact_status.color}
                      seed={c.contact_status.id}
                    />
                  ) : null
                }
              />
              <InfoField
                label="種別"
                value={
                  c.contact_type ? contactTypeLabel[c.contact_type] ?? "—" : "—"
                }
              />
              {/* 所属と担当は別レコードへの紐づけ。全体保存に紛れないようここで直す */}
              <RelationField
                label="所属事業者情報"
                value={c.company_id}
                display={
                  c.company ? (
                    <EntityLink href={`/companies/${c.company.id}`}>
                      {c.company.name}
                    </EntityLink>
                  ) : null
                }
                options={companyOptions}
                searchKind="company"
                action={saveRelation.bind(null, "company_id")}
                editable={canEdit}
              />
              <RelationField
                label="担当者"
                value={c.owner_user_id}
                display={c.owner?.full_name ?? null}
                options={ownerOptions}
                action={saveRelation.bind(null, "owner_user_id")}
                editable={canEdit}
              />
              {/* いつからこの状態かが分からないと、休眠・退職の判断が追えない */}
              <InfoField
                label="ステータス更新日"
                value={formatDate(c.status_updated_at)}
              />
              <InfoField
                label="個人サイトURL"
                full
                value={<ExternalLinkText value={c.website_url} />}
              />
            </div>
          </DetailSection>

          {/* 兼務。**主たる所属は上の「所属事業者情報」が持つ** */}
          <CompanyAffiliationsSection
            contactId={c.id}
            affiliations={c.company_contacts ?? []}
            companyOptions={affiliationOptions}
            editable={canEdit}
          />

          {/* 所属は名刺ごとの情報。どれを現在の所属とするかは人が選ぶ */}
          <BusinessCardsSection cards={c.business_cards ?? []} contactId={c.id} />

          {/* 紹介した相手。名刺に持つ紹介者の逆引き（0 件なら出さない） */}
          <ReferredContactsSection rows={referred} />

          {c.internal_memo && (
            <DetailSection title="メモ" icon={StickyNote}>
              <InfoField label="社内メモ" value={c.internal_memo} />
            </DetailSection>
          )}
        </div>

        {/* ======== Right ======== */}
        <div className={sectionStackClass}>
          {/* 人物の特性。business 情報ではないので本文から分けて右に置く */}
          <DetailSection title="プロファイル" icon={Sparkles}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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

          {/* Gmail 連携で取り込んだやり取り。本文は持たないので Gmail へ遷移する */}
          <EmailHistorySection messages={emailMessages} />

          {/* 連絡先と取引先はどちらが親とも言えないので、両側から足し外しできる */}
          {/*
            取引先への紐づけは契約から生まれる（契約を登録すると
            ensure_account_on_contract が取引先を作り、ディールの相手担当者を
            主担当として登録する）。人が連絡先側から足すものではないので
            ここは閲覧のみ。窓口を足し外しするのは取引先詳細の「連絡先一覧」。
          */}
          <DetailSection title="窓口になっている取引先" icon={Briefcase}>
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
                    {accountContactRoleLabel(ac.role) && (
                      <span style={roleBadgeStyle}>
                        {accountContactRoleLabel(ac.role)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection
            title="ディール"
            icon={Handshake}
            action={
              <AddRelatedLink
                href={`/deals/new?contact_id=${c.id}`}
                label="ディールを追加"
              />
            }
          >
            {contactDeals.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {contactDeals.map((deal) => (
                  <div
                    key={deal.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <EntityLink href={`/deals/${deal.id}`} compact>
                      {deal.name}
                    </EntityLink>
                    <span
                      style={{
                        display: "block",
                        color: "var(--color-sumi600)",
                        fontSize: "0.75rem",
                        marginTop: "0.125rem",
                      }}
                    >
                      {deal.deal_stage?.name ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>
                —
              </p>
            )}
          </DetailSection>

          {/* タレントは連絡先 1 人に 1 件。未登録なら登録の導線を出す */}
          {!talent && (
            <DetailSection
              title="タレント情報"
              icon={Star}
              action={
                <AddRelatedLink
                  href={`/talents/new?contact_id=${c.id}`}
                  label="タレントとして登録"
                />
              }
            >
              <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>
                未登録です。スキル・経歴・適性を管理する場合は登録してください。
              </p>
            </DetailSection>
          )}

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
                  <div className={fieldGridClass}>
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

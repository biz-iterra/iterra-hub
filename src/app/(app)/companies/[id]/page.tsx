import { getCompany, updateCompany } from "@/actions/companies";
import { getCompanyIntegrationProfile } from "@/actions/integration-profiles";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { RelationField } from "@/components/ui/RelationField";
import { getCompanyFinancialInfo } from "@/actions/financial-info";
import { getDeals } from "@/actions/deals";
import { getLeads } from "@/actions/leads";
import { accountTypeLabel } from "@/lib/validators/financial-info";
import { getEntityAddresses } from "@/actions/entity-addresses";
import { AddressList } from "@/components/common/AddressesEditor";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  FileText,
  Handshake,
  UserSearch,
  Landmark,
  Layers,
  Mail,
  Star,
  Pencil,
  StickyNote,
  Users,
} from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { IntegrationProfileSection } from "@/components/companies/IntegrationProfileSection";
import { AddRelatedLink } from "@/components/ui/AddRelatedLink";
import { isSoleProprietorTypeName } from "@/lib/company-type";
import { FreeeLinkIcon } from "@/components/freee/FreeeLinkIcon";
import { InfoField } from "@/components/ui/InfoField";
import { LabelBadge, StatusBadge } from "@/components/ui/badges";
import { ExternalLinkText } from "@/components/ui/ExternalLinkText";
import { EntityLink } from "@/components/ui/EntityLink";
import { detailContainerClass, detailGridClass, fieldGridClass, sectionStackClass } from "@/lib/layout";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 実在確認の日付表示。時刻までは要らないので日付だけ出す */
function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

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

export default async function CompanyDetailPage({
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
        <Link href="/companies" style={backLinkStyle}>
          <ArrowLeft size={16} />
          事業者情報一覧
        </Link>
      </div>
    );
  }

  const [
    { data: company, error },
    { data: addressRows },
    { data: users },
    { data: me },
    { data: financialInfo },
    { data: dealsPage },
    { data: integrationProfile },
    { data: leadsPage },
  ] =
    await Promise.all([
      getCompany(id),
      getEntityAddresses("company", id),
      getCrmUsers(),
      getCurrentUser(),
      // 口座番号を含むので manager 未満には返らない（null になる）
      getCompanyFinancialInfo(id),
      // 契約前のディールは取引先ではなくこの事業者に紐づく（database-design.md §16）
      getDeals({ companyId: id, perPage: 50 }),
      // freee へ渡す値の選択。**admin 以外は使わない**ので表示側で出し分ける
      getCompanyIntegrationProfile(id, "freee"),
      // **事業者 1 : リード N**（T-0072）。同じ会社から来た案件をまとめて見る。
      // これまで事業者からリードを辿る手段が画面にもクエリにも無かった
      getLeads({ company_id: id, page: 1, perPage: 50 }),
    ]);
  const companyDeals = dealsPage?.rows ?? [];
  const leadRows = leadsPage?.rows ?? [];
  const addresses = addressRows ?? [];

  if (error || !company) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          事業者情報が見つかりません
        </p>
        <Link href="/companies" style={backLinkStyle}>
          <ArrowLeft size={16} />
          事業者情報一覧
        </Link>
      </div>
    );
  }

  // 紐づけの付け替え。編集ページ側からは外してあり、ここが唯一の入口になる
  const canEdit = me?.role === "admin" || company.owner_user_id === me?.id;
  const ownerOptions = (users ?? []).map((u) => ({ value: u.id, label: u.full_name }));

  /** 楽観ロックに使う updated_at は、この画面を出した時点の値で閉じ込める */
  async function saveRelation(
    field: "primary_contact_id" | "owner_user_id" | "representative_contact_id",
    value: string | null
  ) {
    "use server";
    const { error: saveError } = await updateCompany(id, {
      [field]: value,
      expected_updated_at: company?.updated_at ?? undefined,
    });
    return { error: saveError };
  }

  const activeAccounts =
    company.accounts?.filter((a) => a.deleted_at === null) ?? [];
  const activeContacts =
    company.contacts?.filter((c) => c.deleted_at === null) ?? [];
  /**
   * 兼務でこの事業者に関わる連絡先。**主たる所属は上の activeContacts**。
   * 一覧では両方を出す（片方だけ見ると関わりのある人を取りこぼす）。
   * 代表者・主担当の選択肢は主たる所属のままにしてある
   */
  const affiliatedContacts = (company.company_contacts ?? [])
    .filter((a) => a.contact && a.contact.deleted_at === null)
    .map((a) => ({ ...a.contact!, job_title: a.job_title ?? a.contact!.job_title }));
  /** 主担当に選べる人。主たる所属 + 兼務 */
  const primaryContactOptions = [...activeContacts, ...affiliatedContacts].map((c) => ({
    value: c.id,
    label:
      `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() +
      (c.contact_code ? ` (${c.contact_code})` : ""),
  }));

  // 個人事業主は法人番号を持たず、国税庁の台帳にも載らない
  const isSoleProprietor = isSoleProprietorTypeName(company.corporate_types?.name);

  // 代表者に選べるのは法人代表の連絡先。**個人事業主は本人が「個人」種別で
  // 登録されることがある**ので、そのときは種別で絞らない（2026-08-04）
  const representativeOptions = activeContacts
    .filter((c) => isSoleProprietor || c.contact_type === "corporate_rep")
    .map((c) => ({
      value: c.id,
      label:
        `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() +
        (c.contact_code ? ` (${c.contact_code})` : ""),
    }));

  // freee の紐づけ。1 事業者に複数の取引先が紐づくことは想定していないので先頭を見る
  const freeeLinkStatus =
    (company.freee_partners?.[0]?.link_status as
      | "unlinked"
      | "auto"
      | "confirmed"
      | "excluded"
      | undefined) ?? null;

  const industryLabel = company.industry_classifications
    ? [
        company.industry_classifications.major_name,
        company.industry_classifications.middle_name,
        company.industry_classifications.minor_name,
      ]
        .filter(Boolean)
        .join(" > ")
    : null;

  return (
    <div className={detailContainerClass}>
      {/* ---- Header ---- */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/companies" style={{ ...backLinkStyle, marginBottom: "0.75rem" }}>
          <ArrowLeft size={16} />
          事業者情報一覧
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
          {company.company_code && (
            <span
              style={{
                color: "var(--color-sumi600)",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {company.company_code}
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
            {company.name}
          </h1>
          {/*
            freee との連携状態。**admin のときだけ出す。**
            freee_partners は RLS で admin しか読めず、他ロールでは連携済みでも
            空で返るため、未連携と区別がつかない
          */}
          {me?.role === "admin" && (
            <FreeeLinkIcon status={freeeLinkStatus} size={16} />
          )}
          <Link href={`/companies/${company.id}/edit`} style={editButtonStyle}>
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
          <DetailSection title="基本情報" icon={Building2}>
            <div
              className={fieldGridClass}
            >
              {/* 事業者名が表示・検索の正本。会社名／屋号名は補助として別に持つ */}
              <InfoField label="事業者名" value={company.name} />
              {isSoleProprietor ? (
                <InfoField label="屋号名" value={company.trade_name} />
              ) : (
                <InfoField label="会社名" value={company.corporate_name} />
              )}
              <InfoField label="フリガナ" value={company.name_kana} />
              {/* 代表者は連絡先から選ぶ。**個人事業主でも出す**（事業主本人を
                  紐づけたいため。2026-08-04 の指示）。連絡先がまだ無い場合に
                  備えて自由入力の representative_name も表示に残す */}
              {(
                <RelationField
                  label={isSoleProprietor ? "事業主" : "代表者"}
                  value={company.representative_contact_id}
                  display={
                    company.representative_contact ? (
                      <EntityLink href={`/contacts/${company.representative_contact.id}`}>
                        {company.representative_contact.last_name}{" "}
                        {company.representative_contact.first_name}
                      </EntityLink>
                    ) : company.representative_name ? (
                      <span>{company.representative_name}</span>
                    ) : null
                  }
                  // 代表として選べるのは、この会社に紐づく「法人代表」の連絡先だけ
                  options={representativeOptions}
                  action={saveRelation.bind(null, "representative_contact_id")}
                  editable={canEdit}
                />
              )}
              {!isSoleProprietor && (
                <InfoField label="法人番号" value={company.corporate_number} />
              )}
              {/* 担当者と社内担当者は別レコードへの紐づけ。ここで直す。
                  担当者は個人事業主には出さない（本人しかいないため） */}
              {!isSoleProprietor && (
              <RelationField
                label="担当者"
                value={company.primary_contact_id}
                display={
                  company.primary_contact ? (
                    <EntityLink href={`/contacts/${company.primary_contact.id}`}>
                      {company.primary_contact.last_name}{" "}
                      {company.primary_contact.first_name}
                    </EntityLink>
                  ) : null
                }
                /*
                  会社側の窓口なので、その会社に**関わる**連絡先から選ぶ。
                  **兼務も含める**（2026-08-06）。同じ人が 2 社の担当者になる
                  ことがあり、主たる所属だけに絞ると選べない。
                  代表者（下の RelationField）は法人代表の話なので広げない
                */
                options={primaryContactOptions}
                action={saveRelation.bind(null, "primary_contact_id")}
                editable={canEdit}
              />
              )}
              <RelationField
                label="社内担当者"
                value={company.owner_user_id}
                display={company.crm_users?.full_name ?? null}
                options={ownerOptions}
                action={saveRelation.bind(null, "owner_user_id")}
                editable={canEdit}
              />
            </div>
            {/* 所在地は住所マスタから。本社・支店・請求先を並べる */}
            <div style={{ marginTop: "1rem" }}>
              <InfoField label="所在地" value={<AddressList addresses={addresses} />} />
            </div>
          </DetailSection>

          <DetailSection title="属性情報" icon={Layers}>
            <div
              className={fieldGridClass}
            >
              {/* 個人事業主のときは自明なので出さない */}
              {!isSoleProprietor && (
                <InfoField label="事業種別" value={company.corporate_types?.name} />
              )}
              <InfoField label="業種" value={industryLabel} />
              <InfoField
                label="ステータス"
                value={
                  company.company_status ? (
                    <StatusBadge
                      name={company.company_status.name}
                      color={company.company_status.color}
                      seed={company.company_status.id}
                    />
                  ) : null
                }
              />
              <InfoField label="リードソース" value={company.lead_sources?.name} />
              {/* 実在確認の記録。ステータスがどの確認に基づくかを示す */}
              <InfoField
                label="最終確認"
                value={
                  isSoleProprietor
                    ? "対象外（個人事業主）"
                    : company.verified_at
                    ? `${formatDate(company.verified_at)}（${
                        company.verification_source === "houjin_bangou_api"
                          ? "法人番号API"
                          : "手動"
                      }）`
                    : "未確認"
                }
              />
              <InfoField label="確認者" value={company.verifier?.full_name} />
              <InfoField
                label="ステータス更新日"
                value={formatDate(company.status_updated_at)}
              />
              <InfoField label="確認メモ" value={company.verification_note} full />
              {/* 個人事業主は登記されないので登記事項証明書も無い */}
              {!isSoleProprietor && (
                <InfoField
                  label="登記事項証明書URL"
                  full
                  value={<ExternalLinkText value={company.registration_certificate_url} />}
                />
              )}
            </div>
          </DetailSection>

          <DetailSection title="連絡先" icon={Mail}>
            <div
              className={fieldGridClass}
            >
              <InfoField label="代表電話" value={company.phone} />
              <InfoField label="FAX" value={company.fax} />
              <InfoField
                label="ホームページURL"
                full
                value={<ExternalLinkText value={company.website_url} />}
              />
              <InfoField
                label="メールドメイン"
                full
                value={
                  company.company_domains && company.company_domains.length > 0 ? (
                    <span
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.375rem",
                      }}
                    >
                      {[...company.company_domains]
                        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                        .map((d) => (
                          <span
                            key={d.id}
                            title={d.is_primary ? "代表ドメイン" : undefined}
                            style={{
                              fontFamily: "monospace",
                              fontSize: "0.8125rem",
                              borderRadius: "var(--radius-badge)",
                              padding: "0.125rem 0.5rem",
                              backgroundColor: d.is_primary
                                ? "rgba(122, 165, 146, 0.14)"
                                : "var(--color-sumi100)",
                              color: d.is_primary ? "#4D7A65" : "var(--color-sumi700)",
                            }}
                          >
                            {d.domain}
                          </span>
                        ))}
                    </span>
                  ) : null
                }
              />
            </div>
          </DetailSection>

          <DetailSection title="インボイス" icon={FileText}>
            <div
              className={fieldGridClass}
            >
              <InfoField
                label="登録有無"
                value={company.invoice_registration_number ? "登録済み" : "未登録"}
              />
              <InfoField
                label="登録番号"
                value={company.invoice_registration_number}
              />
            </div>
          </DetailSection>

          {/* 振込先。口座番号を含むので manager 以上にだけ出す */}
          {financialInfo !== null && (
            <DetailSection title="金融機関情報" icon={Landmark}>
              {financialInfo.length === 0 ? (
                <p
                  style={{
                    color: "var(--color-sumi400)",
                    fontSize: "0.875rem",
                    margin: 0,
                  }}
                >
                  登録されていません
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {financialInfo.map((fi) => (
                    <div
                      key={fi.id}
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                        paddingBottom: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.375rem",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          color: "var(--color-text-title)",
                        }}
                      >
                        {fi.is_primary && (
                          <Star size={12} style={{ color: "var(--color-terra)" }} />
                        )}
                        {fi.bank_name}
                        {fi.branch_name && ` ${fi.branch_name}`}
                      </span>
                      <div
                        style={{
                          color: "var(--color-sumi600)",
                          fontSize: "0.8125rem",
                          marginTop: "0.125rem",
                        }}
                      >
                        {[
                          accountTypeLabel(fi.account_type),
                          fi.account_number,
                          fi.account_holder_kana ?? fi.account_holder,
                        ]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          )}

          {company.internal_memo && (
            <DetailSection title="メモ" icon={StickyNote}>
              <InfoField label="社内メモ" value={company.internal_memo} />
            </DetailSection>
          )}
        </div>

        {/* ======== Right ======== */}
        <div className={sectionStackClass}>
          <DetailSection title="取引先一覧" icon={Briefcase}>
            {activeAccounts.length > 0 ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
              >
                {activeAccounts.map((account) => (
                  <div
                    key={account.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        color: "var(--color-sumi500)",
                        fontSize: "0.6875rem",
                        fontFamily: "monospace",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {account.account_code}
                    </span>
                    <EntityLink href={`/accounts/${account.id}`} compact>
                      {account.name}
                    </EntityLink>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  color: "var(--color-sumi400)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                —
              </p>
            )}
          </DetailSection>

          <DetailSection
            title="連絡先一覧"
            icon={Users}
            action={
              <AddRelatedLink
                href={`/contacts/new?company_id=${company.id}`}
                label="連絡先を追加"
              />
            }
          >
            {activeContacts.length + affiliatedContacts.length > 0 ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
              >
                {activeContacts.map((contact) => (
                  <div
                    key={contact.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <EntityLink href={`/contacts/${contact.id}`} compact>
                      {contact.last_name} {contact.first_name}
                    </EntityLink>
                    {(contact.department || contact.job_title) && (
                      <span
                        style={{
                          display: "block",
                          color: "var(--color-sumi600)",
                          fontSize: "0.75rem",
                          marginTop: "0.125rem",
                        }}
                      >
                        {[contact.department, contact.job_title]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    )}
                  </div>
                ))}
                {/* 兼務。**主たる所属が別にある人**なので、そうと分かるようにする */}
                {affiliatedContacts.map((contact) => (
                  <div
                    key={`affiliated-${contact.id}`}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
                    >
                      <EntityLink href={`/contacts/${contact.id}`} compact>
                        {contact.last_name} {contact.first_name}
                      </EntityLink>
                      <LabelBadge name="兼務" />
                    </span>
                    {(contact.department || contact.job_title) && (
                      <span
                        style={{
                          display: "block",
                          color: "var(--color-sumi600)",
                          fontSize: "0.75rem",
                          marginTop: "0.125rem",
                        }}
                      >
                        {[contact.department, contact.job_title]
                          .filter(Boolean)
                          .join(" / ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  color: "var(--color-sumi400)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                —
              </p>
            )}
          </DetailSection>

          {/*
            freee へ渡す値の選択。**admin のときだけ出す**（freee 連携が admin 限定）。
            同じ人が 2 社の担当者で会社ごとにメールを使い分けている場合、
            主メールは連絡先に 1 つしか立たないのでここで選ぶ（T-0060）
          */}
          {me?.role === "admin" && integrationProfile && (
            <IntegrationProfileSection
              companyId={company.id}
              integration="freee"
              view={integrationProfile}
            />
          )}

          {/*
            ディール。取引先は契約成立まで作られないため、契約前のディールは
            この事業者情報に紐づく。ここから起こせるようにしておく
          */}
          <DetailSection
            title="ディール"
            icon={Handshake}
            action={
              <AddRelatedLink
                href={`/deals/new?company_id=${company.id}`}
                label="ディールを追加"
              />
            }
          >
            {companyDeals.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {companyDeals.map((deal) => (
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
              <p
                style={{
                  color: "var(--color-sumi400)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                —
              </p>
            )}
          </DetailSection>

          {/*
            リード。**事業者 1 : リード N**（T-0072）。同じ会社から
            2 件目・3 件目のリードが来るのは普通で、事業者は 1 つに寄せる
          */}
          <DetailSection
            title="リード"
            icon={UserSearch}
            action={
              <AddRelatedLink
                href={`/leads/new?company_id=${company.id}`}
                label="リードを追加"
              />
            }
          >
            {leadRows.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {leadRows.map((lead) => (
                  <div
                    key={lead.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      fontSize: "0.875rem",
                    }}
                  >
                    <EntityLink href={`/leads/${lead.id}`} compact>
                      {lead.lead_name ?? "（名称未設定）"}
                    </EntityLink>
                    <span style={{ color: "var(--color-sumi500)", fontSize: "0.75rem" }}>
                      {lead.stage?.name ?? "—"}
                      {lead.category?.name ? ` / ${lead.category.name}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  color: "var(--color-sumi400)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                —
              </p>
            )}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

import { getCompany, updateCompany } from "@/actions/companies";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { RelationField } from "@/components/ui/RelationField";
import { getCompanyFinancialInfo } from "@/actions/financial-info";
import { accountTypeLabel } from "@/lib/validators/financial-info";
import { getEntityAddresses } from "@/actions/entity-addresses";
import { AddressList } from "@/components/common/AddressesEditor";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  FileText,
  Landmark,
  Layers,
  Mail,
  Star,
  Pencil,
  StickyNote,
  Users,
} from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { EntityLink } from "@/components/ui/EntityLink";
import { detailContainerStyle, detailGridStyle, fieldGridStyle, sectionStackStyle } from "@/lib/layout";

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
  ] =
    await Promise.all([
      getCompany(id),
      getEntityAddresses("company", id),
      getCrmUsers(),
      getCurrentUser(),
      // 口座番号を含むので manager 未満には返らない（null になる）
      getCompanyFinancialInfo(id),
    ]);
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
    field: "primary_contact_id" | "owner_user_id",
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

  // 個人事業主は法人番号を持たず、国税庁の台帳にも載らない
  const isSoleProprietor = company.corporate_types?.name === "個人事業主";

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
    <div style={detailContainerStyle}>
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
          <Link href={`/companies/${company.id}/edit`} style={editButtonStyle}>
            <Pencil size={14} />
            編集
          </Link>
        </div>
      </div>

      {/* ---- 8:2 Grid ---- */}
      <div
        style={detailGridStyle}
      >
        {/* ======== Left ======== */}
        <div style={sectionStackStyle}>
          <DetailSection title="基本情報" icon={Building2}>
            <div
              style={fieldGridStyle}
            >
              <InfoField label="会社名" value={company.name} />
              <InfoField label="フリガナ" value={company.name_kana} />
              <InfoField label="代表者名" value={company.representative_name} />
              {!isSoleProprietor && (
                <InfoField label="法人番号" value={company.corporate_number} />
              )}
              {/* 担当者と社内担当者は別レコードへの紐づけ。ここで直す */}
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
                // 会社側の窓口なので、その会社に紐づく連絡先だけから選ぶ
                options={activeContacts.map((c) => ({
                  value: c.id,
                  label:
                    `${c.last_name ?? ""} ${c.first_name ?? ""}`.trim() +
                    (c.contact_code ? ` (${c.contact_code})` : ""),
                }))}
                action={saveRelation.bind(null, "primary_contact_id")}
                editable={canEdit}
              />
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
              style={fieldGridStyle}
            >
              <InfoField label="法人格" value={company.corporate_types?.name} />
              <InfoField label="業種" value={industryLabel} />
              <InfoField label="ステータス" value={company.company_status?.name} />
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
              <InfoField
                label="登記事項証明書URL"
                full
                value={
                  company.registration_certificate_url ? (
                    <a
                      href={company.registration_certificate_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--color-terra)",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}
                    >
                      {company.registration_certificate_url}
                    </a>
                  ) : null
                }
              />
            </div>
          </DetailSection>

          <DetailSection title="連絡先" icon={Mail}>
            <div
              style={fieldGridStyle}
            >
              <InfoField label="代表電話" value={company.phone} />
              <InfoField label="FAX" value={company.fax} />
              <InfoField
                label="ホームページURL"
                full
                value={
                  company.website_url ? (
                    <a
                      href={company.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--color-terra)",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}
                    >
                      {company.website_url}
                    </a>
                  ) : null
                }
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
              style={fieldGridStyle}
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
        <div style={sectionStackStyle}>
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

          <DetailSection title="連絡先一覧" icon={Users}>
            {activeContacts.length > 0 ? (
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

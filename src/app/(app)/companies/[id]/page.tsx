import { getCompany } from "@/actions/companies";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  FileText,
  Layers,
  Mail,
  Pencil,
  StickyNote,
  Users,
} from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { EntityLink } from "@/components/ui/EntityLink";

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
          法人情報一覧
        </Link>
      </div>
    );
  }

  const { data: company, error } = await getCompany(id);

  if (error || !company) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          法人情報が見つかりません
        </p>
        <Link href="/companies" style={backLinkStyle}>
          <ArrowLeft size={16} />
          法人情報一覧
        </Link>
      </div>
    );
  }

  const activeAccounts =
    company.accounts?.filter((a) => a.deleted_at === null) ?? [];
  const activeContacts =
    company.contacts?.filter((c) => c.deleted_at === null) ?? [];

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
    <div style={{ padding: "1.5rem", maxWidth: "1280px", margin: "0 auto" }}>
      {/* ---- Header ---- */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/companies" style={{ ...backLinkStyle, marginBottom: "0.75rem" }}>
          <ArrowLeft size={16} />
          法人情報一覧
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
        style={{
          display: "grid",
          gridTemplateColumns: "8fr 2fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ======== Left ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <DetailSection title="基本情報" icon={Building2}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="会社名" value={company.name} />
              <InfoField label="フリガナ" value={company.name_kana} />
              <InfoField label="代表者名" value={company.representative_name} />
              <InfoField label="法人番号" value={company.corporate_number} />
              <InfoField
                label="担当者"
                value={
                  company.primary_contact ? (
                    <EntityLink href={`/contacts/${company.primary_contact.id}`}>
                      {company.primary_contact.last_name}{" "}
                      {company.primary_contact.first_name}
                    </EntityLink>
                  ) : null
                }
              />
              <InfoField label="社内担当者" value={company.crm_users?.full_name} />
            </div>
          </DetailSection>

          <DetailSection title="属性情報" icon={Layers}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="法人格" value={company.corporate_types?.name} />
              <InfoField label="業種" value={industryLabel} />
              <InfoField label="ステータス" value={company.company_status?.name} />
              <InfoField label="リードソース" value={company.lead_sources?.name} />
              {/* 実在確認の記録。ステータスがどの確認に基づくかを示す */}
              <InfoField
                label="最終確認"
                value={
                  company.verified_at
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
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="郵便番号" value={company.postal_code} />
              <InfoField label="都道府県" value={company.prefecture} />
              <InfoField label="市区町村" value={company.city} />
              <InfoField label="番地" value={company.address_line1} />
              <InfoField label="建物名" value={company.address_line2} />
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
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
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

          {company.internal_memo && (
            <DetailSection title="メモ" icon={StickyNote}>
              <InfoField label="社内メモ" value={company.internal_memo} />
            </DetailSection>
          )}
        </div>

        {/* ======== Right ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
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

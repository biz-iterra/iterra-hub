import { getCompany } from "@/actions/companies";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  MapPin,
  Globe,
  Phone as PhoneIcon,
  FileText,
  Pencil,
} from "lucide-react";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        <Link
          href="/companies"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          カンパニー一覧へ戻る
        </Link>
      </div>
    );
  }

  const { data: company, error } = await getCompany(id);

  if (error || !company) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          カンパニーが見つかりません
        </p>
        <Link
          href="/companies"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          カンパニー一覧へ戻る
        </Link>
      </div>
    );
  }

  const activeAccounts =
    company.accounts?.filter((a: any) => a.deleted_at === null) ?? [];
  const activeContacts =
    company.contacts?.filter((c: any) => c.deleted_at === null) ?? [];

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
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/companies"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-sumi600)",
            fontSize: "0.875rem",
            textDecoration: "none",
            marginBottom: "0.75rem",
          }}
        >
          <ArrowLeft size={16} />
          カンパニー一覧
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
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
          {company.corporate_types?.name && (
            <span
              style={{
                backgroundColor: "var(--color-sumi100)",
                borderRadius: "var(--radius-badge)",
                padding: "0.125rem 0.5rem",
                fontSize: "0.75rem",
              }}
            >
              {company.corporate_types.name}
            </span>
          )}
          <Link
            href={`/companies/${company.id}/edit`}
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
      </div>

      {/* 2カラムレイアウト */}
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
          {/* 基本情報カード */}
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
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <Building2
                size={18}
                style={{ color: "var(--color-text-title)" }}
              />
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                基本情報
              </h2>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoItem label="会社名" value={company.name} />
              <InfoItem label="フリガナ" value={company.name_kana} />
              <InfoItem label="代表者名" value={company.representative_name} />
              <InfoItem
                label="事業者種別"
                value={company.corporate_types?.name}
              />
              <InfoItem label="業種分類" value={industryLabel} />
              <InfoItem
                label="リードソース"
                value={company.lead_sources?.name}
              />
              <InfoItem
                label="担当者"
                value={company.crm_users?.full_name}
              />
            </div>
          </div>

          {/* 住所カード */}
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
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <MapPin
                size={18}
                style={{ color: "var(--color-text-title)" }}
              />
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                住所
              </h2>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoItem label="郵便番号" value={company.postal_code} />
              <InfoItem label="都道府県" value={company.prefecture} />
              <InfoItem label="市区町村" value={company.city} />
              <InfoItem label="番地" value={company.address_line1} />
              <InfoItem label="建物名" value={company.address_line2} />
            </div>
          </div>

          {/* 連絡先カード */}
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
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <PhoneIcon
                size={18}
                style={{ color: "var(--color-text-title)" }}
              />
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                連絡先
              </h2>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoItem label="代表電話" value={company.phone} />
              <InfoItem label="FAX" value={company.fax} />
              <div style={{ gridColumn: "1 / -1" }}>
                <span
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "0.25rem",
                  }}
                >
                  ホームページURL
                </span>
                {company.website_url ? (
                  <a
                    href={company.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--color-terra)",
                      fontSize: "0.875rem",
                      textDecoration: "underline",
                    }}
                  >
                    {company.website_url}
                  </a>
                ) : (
                  <span
                    style={{
                      color: "var(--color-sumi400)",
                      fontSize: "0.875rem",
                    }}
                  >
                    -
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* インボイスカード */}
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
                gap: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              <FileText
                size={18}
                style={{ color: "var(--color-text-title)" }}
              />
              <h2
                style={{
                  color: "var(--color-text-title)",
                  fontSize: "1rem",
                  fontWeight: 600,
                  margin: 0,
                }}
              >
                インボイス
              </h2>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoItem label="法人番号" value={company.corporate_number} />
              <InfoItem
                label="インボイス登録"
                value={company.is_invoice_registered ? "登録済み" : "未登録"}
              />
              <InfoItem
                label="登録番号"
                value={company.invoice_registration_number}
              />
            </div>
          </div>

          {/* メモカード */}
          {company.internal_memo && (
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
                  margin: "0 0 0.75rem 0",
                }}
              >
                メモ
              </h2>
              <p
                style={{
                  color: "var(--color-text-body)",
                  fontSize: "0.875rem",
                  whiteSpace: "pre-wrap",
                  margin: 0,
                }}
              >
                {company.internal_memo}
              </p>
            </div>
          )}
        </div>

        {/* 右カラム */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* アカウント一覧カード */}
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
                margin: "0 0 1rem 0",
              }}
            >
              アカウント一覧
            </h2>
            {activeAccounts.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        backgroundColor: "var(--color-sumi50)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-sumi700)",
                        padding: "0.5rem",
                        textAlign: "left",
                      }}
                    >
                      コード
                    </th>
                    <th
                      style={{
                        backgroundColor: "var(--color-sumi50)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-sumi700)",
                        padding: "0.5rem",
                        textAlign: "left",
                      }}
                    >
                      アカウント名
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeAccounts.map((account: any) => (
                    <tr key={account.id}>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                        }}
                      >
                        <Link
                          href={`/accounts/${account.id}`}
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
                          {account.account_code}
                          <ArrowUpRight size={14} />
                        </Link>
                      </td>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                          color: "var(--color-text-body)",
                          fontSize: "0.875rem",
                        }}
                      >
                        {account.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p
                style={{
                  color: "var(--color-sumi400)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                アカウントなし
              </p>
            )}
          </div>

          {/* コンタクト一覧カード */}
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
                margin: "0 0 1rem 0",
              }}
            >
              コンタクト一覧
            </h2>
            {activeContacts.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th
                      style={{
                        backgroundColor: "var(--color-sumi50)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-sumi700)",
                        padding: "0.5rem",
                        textAlign: "left",
                      }}
                    >
                      コード
                    </th>
                    <th
                      style={{
                        backgroundColor: "var(--color-sumi50)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-sumi700)",
                        padding: "0.5rem",
                        textAlign: "left",
                      }}
                    >
                      氏名
                    </th>
                    <th
                      style={{
                        backgroundColor: "var(--color-sumi50)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-sumi700)",
                        padding: "0.5rem",
                        textAlign: "left",
                      }}
                    >
                      部署
                    </th>
                    <th
                      style={{
                        backgroundColor: "var(--color-sumi50)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-sumi700)",
                        padding: "0.5rem",
                        textAlign: "left",
                      }}
                    >
                      役職
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeContacts.map((contact: any) => (
                    <tr key={contact.id}>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                        }}
                      >
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
                          {contact.contact_code}
                          <ArrowUpRight size={14} />
                        </Link>
                      </td>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                          color: "var(--color-text-body)",
                          fontSize: "0.875rem",
                        }}
                      >
                        {contact.last_name} {contact.first_name}
                      </td>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                          color: "var(--color-text-body)",
                          fontSize: "0.875rem",
                        }}
                      >
                        {contact.department ?? "-"}
                      </td>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                          color: "var(--color-text-body)",
                          fontSize: "0.875rem",
                        }}
                      >
                        {contact.job_title ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p
                style={{
                  color: "var(--color-sumi400)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                コンタクトなし
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <span
        style={{
          color: "var(--color-sumi600)",
          fontSize: "0.75rem",
          fontWeight: 600,
          display: "block",
          marginBottom: "0.25rem",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: value ? "var(--color-text-body)" : "var(--color-sumi400)",
          fontSize: "0.875rem",
        }}
      >
        {value ?? "-"}
      </span>
    </div>
  );
}

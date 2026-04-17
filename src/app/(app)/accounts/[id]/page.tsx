import { getAccount } from "@/actions/accounts";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  Building2,
  Users,
  Handshake,
  Pencil,
} from "lucide-react";

const formatCurrency = (amount: number | null | undefined) => {
  if (amount == null) return "-";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
};

const roleLabelMap: Record<string, string> = {
  primary: "主担当",
  billing: "請求先",
  technical: "技術",
  other: "その他",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AccountDetailPage({
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
          href="/accounts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          アカウント一覧へ戻る
        </Link>
      </div>
    );
  }

  const { data: account, error } = await getAccount(id);
  const a = account as any;

  if (error || !a) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          アカウントが見つかりません
        </p>
        <Link
          href="/accounts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          アカウント一覧へ戻る
        </Link>
      </div>
    );
  }

  const contacts =
    a.contacts
      ?.map((ac: any) => ({
        ...ac.contact,
        role: ac.role,
      }))
      .filter((c: any) => c && c.deleted_at === null) ?? [];

  const deals = a.deals ?? [];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/accounts"
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
          アカウント一覧
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          {a.account_code && (
            <span
              style={{
                color: "var(--color-sumi600)",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {a.account_code}
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
            {a.name}
          </h1>
          {a.account_status?.name && (
            <span
              style={{
                backgroundColor: "var(--color-sumi100)",
                borderRadius: "var(--radius-badge)",
                padding: "0.125rem 0.5rem",
                fontSize: "0.75rem",
              }}
            >
              {a.account_status.name}
            </span>
          )}
          <Link
            href={`/accounts/${a.id}/edit`}
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
              <Briefcase
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
              <InfoItem label="アカウント名" value={a.name} />
              <InfoItem label="種別" value={a.account_type?.name} />
              <InfoItem label="ステータス" value={a.account_status?.name} />
              <InfoItem label="リードソース" value={a.lead_source?.name} />
              <InfoItem label="担当者" value={a.owner?.full_name} />
              {a.description && (
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
                    説明
                  </span>
                  <p
                    style={{
                      color: "var(--color-text-body)",
                      fontSize: "0.875rem",
                      whiteSpace: "pre-wrap",
                      margin: 0,
                    }}
                  >
                    {a.description}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* カンパニー情報カード */}
          {a.company && (
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
                  カンパニー情報
                </h2>
              </div>
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
                  カンパニー名
                </span>
                <Link
                  href={`/companies/${a.company.id}`}
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
                  {a.company.name}
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          )}

          {/* ディール一覧カード */}
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
              <Handshake
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
                ディール一覧
              </h2>
            </div>
            {deals.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["コード", "取引名", "ステージ", "ステータス", "金額"].map(
                      (header) => (
                        <th
                          key={header}
                          style={{
                            backgroundColor: "var(--color-sumi50)",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            color: "var(--color-sumi700)",
                            padding: "0.5rem",
                            textAlign: header === "金額" ? "right" : "left",
                          }}
                        >
                          {header}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal: any) => (
                    <tr key={deal.id}>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                        }}
                      >
                        <Link
                          href={`/deals/${deal.id}`}
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
                          {deal.deal_code}
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
                        {deal.name}
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
                        {deal.deal_stage?.name ?? "-"}
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
                        {deal.deal_status?.name ?? "-"}
                      </td>
                      <td
                        style={{
                          borderBottom:
                            "1px solid var(--color-border-default)",
                          padding: "0.5rem",
                          color: "var(--color-text-body)",
                          fontSize: "0.875rem",
                          textAlign: "right",
                        }}
                      >
                        {formatCurrency(deal.amount)}
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
                ディールなし
              </p>
            )}
          </div>
        </div>

        {/* 右カラム */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* コンタクト一覧カード */}
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
              <Users
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
                コンタクト一覧
              </h2>
            </div>
            {contacts.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {contacts.map((contact: any) => (
                  <div
                    key={contact.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginBottom: "0.25rem",
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
                          fontWeight: 500,
                        }}
                      >
                        {contact.last_name} {contact.first_name}
                        <ArrowUpRight size={14} />
                      </Link>
                      {contact.role && (
                        <span
                          style={{
                            backgroundColor: "var(--color-sumi100)",
                            borderRadius: "var(--radius-badge)",
                            padding: "0.125rem 0.5rem",
                            fontSize: "0.75rem",
                          }}
                        >
                          {roleLabelMap[contact.role] ?? contact.role}
                        </span>
                      )}
                    </div>
                    {(contact.department || contact.job_title) && (
                      <span
                        style={{
                          color: "var(--color-sumi600)",
                          fontSize: "0.75rem",
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

import { getContract } from "@/actions/contracts";
import { getCurrentUser } from "@/actions/users";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FileText, Calendar, Building2, Pencil } from "lucide-react";
import { ContractMethodBadge } from "@/components/ui/badges";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ja-JP");
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContractDetailPage({
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
          href="/contracts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          契約一覧へ戻る
        </Link>
      </div>
    );
  }

  const [{ data: contract, error }, meResult] = await Promise.all([
    getContract(id),
    getCurrentUser(),
  ]);
  const role = meResult.data?.role ?? null;
  const isManagerOrAbove = role === "manager" || role === "admin";

  if (error || !contract) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          契約が見つかりません
        </p>
        <Link
          href="/contracts"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-sumi600)",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
            transition: "background-color 0.15s",
          }}
        >
          契約一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/contracts"
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
          契約一覧
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          {contract.contract_code && (
            <span
              style={{
                color: "var(--color-sumi600)",
                fontSize: "0.875rem",
              }}
            >
              {contract.contract_code}
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
            {contract.contract_name}
          </h1>
          {isManagerOrAbove && (
            <Link
              href={`/contracts/${contract.id}/edit`}
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
          )}
        </div>
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
          {/* 基本情報カード */}
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
              <FileText size={18} />
              基本情報
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  契約書名
                </div>
                <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                  {contract.contract_name}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  契約方法
                </div>
                <ContractMethodBadge method={contract.contract_method} />
              </div>
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  契約種別
                </div>
                <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                  {contract.contract_type?.name ?? "—"}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  契約内容
                </div>
                <div
                  style={{
                    color: "var(--color-text-body)",
                    fontSize: "0.875rem",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {contract.contract_content ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* 商談情報カード */}
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
              商談情報
            </h2>
            {contract.deal ? (
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  商談
                </div>
                <Link
                  href={`/deals/${contract.deal.id}`}
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
                  {contract.deal.deal_code} {contract.deal.name}
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            ) : (
              <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                —
              </div>
            )}
          </div>

          {/* 契約相手先カード */}
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
              <Building2 size={18} />
              契約相手先
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  契約相手先区分
                </div>
                <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                  {contract.counterparty_type === "corporate" ? "法人" : "個人"}
                </div>
              </div>

              {contract.counterparty_type === "corporate" ? (
                <>
                  <div>
                    <div
                      style={{
                        color: "var(--color-sumi600)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        marginBottom: "0.25rem",
                      }}
                    >
                      会社情報
                    </div>
                    {contract.counterparty_company ? (
                      <Link
                        href={`/companies/${contract.counterparty_company.id}`}
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
                        {contract.counterparty_company.name}
                        <ArrowUpRight size={14} />
                      </Link>
                    ) : (
                      <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                        —
                      </div>
                    )}
                  </div>
                  <div>
                    <div
                      style={{
                        color: "var(--color-sumi600)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        marginBottom: "0.25rem",
                      }}
                    >
                      契約担当者
                    </div>
                    {contract.counterparty_manager ? (
                      <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                        {contract.counterparty_manager.last_name}{" "}
                        {contract.counterparty_manager.first_name}
                      </div>
                    ) : (
                      <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                        —
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <div
                    style={{
                      color: "var(--color-sumi600)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      marginBottom: "0.25rem",
                    }}
                  >
                    連絡先
                  </div>
                  {contract.counterparty_contact ? (
                    <Link
                      href={`/contacts/${contract.counterparty_contact.id}`}
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
                      {contract.counterparty_contact.last_name}{" "}
                      {contract.counterparty_contact.first_name}
                      <ArrowUpRight size={14} />
                    </Link>
                  ) : (
                    <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                      —
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 契約書URL カード */}
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
              契約書URL
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  原本URL
                </div>
                {contract.original_document_url ? (
                  <a
                    href={contract.original_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--color-terra)",
                      fontSize: "0.875rem",
                      textDecoration: "none",
                    }}
                  >
                    {contract.original_document_url}
                  </a>
                ) : (
                  <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                    —
                  </div>
                )}
              </div>
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  契約書URL
                </div>
                {contract.contract_url ? (
                  <a
                    href={contract.contract_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--color-terra)",
                      fontSize: "0.875rem",
                      textDecoration: "none",
                    }}
                  >
                    {contract.contract_url}
                  </a>
                ) : (
                  <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                    —
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 右カラム */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* 日程カード */}
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
              <Calendar size={18} />
              日程
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "契約送付日", value: contract.sent_date },
                { label: "サインバック日", value: contract.signback_date },
                { label: "契約締結日", value: contract.execution_date },
                { label: "契約開始日", value: contract.start_date },
                { label: "契約終了日", value: contract.end_date },
                { label: "解約日", value: contract.cancellation_date },
              ].map((item) => (
                <div key={item.label}>
                  <div
                    style={{
                      color: "var(--color-sumi600)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      marginBottom: "0.125rem",
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                    {formatDate(item.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ステータスカード */}
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
              ステータス
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
                  自動更新
                </div>
                <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                  {contract.auto_renewal ? "あり" : "なし"}
                </div>
              </div>
              <div>
                <div
                  style={{
                    color: "var(--color-sumi600)",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    marginBottom: "0.125rem",
                  }}
                >
                  登録者
                </div>
                <div style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                  {contract.registered_user?.full_name ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { getContract } from "@/actions/contracts";
import { getCurrentUser } from "@/actions/users";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Calendar,
  Building2,
  Pencil,
  Handshake,
  Paperclip,
  Layers,
} from "lucide-react";
import { ContractMethodBadge } from "@/components/ui/badges";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { EntityLink } from "@/components/ui/EntityLink";
import { detailContainerStyle, detailGridStyle, fieldGridStyle, sectionStackStyle } from "@/lib/layout";

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
    <div style={detailContainerStyle}>
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
        style={detailGridStyle}
      >
        {/* 左カラム */}
        <div style={sectionStackStyle}>
          {/* 基本情報カード */}
          <DetailSection title="基本情報" icon={FileText}>
            <div
              style={fieldGridStyle}
            >
              <InfoField label="契約書名" value={contract.contract_name} />
              <InfoField
                label="契約方法"
                value={<ContractMethodBadge method={contract.contract_method} />}
              />
              <InfoField label="契約種別" value={contract.contract_type?.name} />
              <InfoField label="契約内容" value={contract.contract_content} full />
            </div>
          </DetailSection>

          {/* 商談情報カード */}
          <DetailSection title="商談情報" icon={Handshake}>
            <InfoField
              label="商談"
              value={
                contract.deal ? (
                  <EntityLink href={`/deals/${contract.deal.id}`}>
                    {contract.deal.deal_code} {contract.deal.name}
                  </EntityLink>
                ) : null
              }
            />
          </DetailSection>

          {/* 契約相手先カード */}
          <DetailSection title="契約相手先" icon={Building2}>
            <div
              style={fieldGridStyle}
            >
              <InfoField
                label="契約相手先区分"
                value={contract.counterparty_type === "corporate" ? "法人" : "個人"}
              />

              {contract.counterparty_type === "corporate" ? (
                <>
                  <InfoField
                    label="事業者情報"
                    value={
                      contract.counterparty_company ? (
                        <EntityLink
                          href={`/companies/${contract.counterparty_company.id}`}
                        >
                          {contract.counterparty_company.name}
                        </EntityLink>
                      ) : null
                    }
                  />
                  <InfoField
                    label="契約担当者"
                    value={
                      contract.counterparty_manager
                        ? `${contract.counterparty_manager.last_name} ${contract.counterparty_manager.first_name}`
                        : null
                    }
                  />
                </>
              ) : (
                <InfoField
                  label="連絡先"
                  value={
                    contract.counterparty_contact ? (
                      <EntityLink
                        href={`/contacts/${contract.counterparty_contact.id}`}
                      >
                        {contract.counterparty_contact.last_name}{" "}
                        {contract.counterparty_contact.first_name}
                      </EntityLink>
                    ) : null
                  }
                />
              )}
            </div>
          </DetailSection>

          {/* 契約書URL カード */}
          <DetailSection title="契約書URL" icon={Paperclip}>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <InfoField
                label="原本URL"
                value={
                  contract.original_document_url ? (
                    <a
                      href={contract.original_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--color-terra)",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}
                    >
                      {contract.original_document_url}
                    </a>
                  ) : null
                }
              />
              <InfoField
                label="契約書URL"
                value={
                  contract.contract_url ? (
                    <a
                      href={contract.contract_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: "var(--color-terra)",
                        textDecoration: "underline",
                        wordBreak: "break-all",
                      }}
                    >
                      {contract.contract_url}
                    </a>
                  ) : null
                }
              />
            </div>
          </DetailSection>
        </div>

        {/* 右カラム */}
        <div style={sectionStackStyle}>
          {/* 日程カード */}
          <DetailSection title="日程" icon={Calendar}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {[
                { label: "契約送付日", value: contract.sent_date },
                { label: "サインバック日", value: contract.signback_date },
                { label: "契約締結日", value: contract.execution_date },
                { label: "契約開始日", value: contract.start_date },
                { label: "契約終了日", value: contract.end_date },
                { label: "解約日", value: contract.cancellation_date },
              ].map((item) => (
                <InfoField
                  key={item.label}
                  label={item.label}
                  value={formatDate(item.value)}
                />
              ))}
            </div>
          </DetailSection>

          {/* ステータスカード */}
          <DetailSection title="ステータス" icon={Layers}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <InfoField
                label="自動更新"
                value={contract.auto_renewal ? "あり" : "なし"}
              />
              <InfoField
                label="登録者"
                value={contract.registered_user?.full_name}
              />
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

import { getDeal } from "@/actions/deals";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  ClipboardList,
  Clock,
  FileText,
  Handshake,
  Layers,
  ListChecks,
  Mail,
  Pencil,
  Phone,
  StickyNote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { EntityLink } from "@/components/ui/EntityLink";
import { getDealCounterparty } from "@/lib/deal-counterparty";
import { LabelBadge, ContractMethodBadge, PipelineBadge, StageBadge, StatusBadge } from "@/components/ui/badges";

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("ja-JP");
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

/**
 * 小さい文字に --color-error（#EF4444）を直接使うと白背景で約 3.8:1 しかなく
 * WCAG AA（通常文字 4.5:1）に届かない。deals-view.tsx の STAGNANT_SEVERE_TEXT と
 * 同じ濃色（#B91C1C ≒ 6.4:1）を文字色に使う。
 */
const OVERDUE_TEXT = "#B91C1C";

function isOverdue(
  expectedCloseDate: string | null | undefined,
  closedAt: string | null | undefined
): boolean {
  if (!expectedCloseDate || closedAt) return false;
  const todayStr = new Date().toISOString().slice(0, 10);
  return expectedCloseDate < todayStr;
}

const activityTypeIcon: Record<string, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: Handshake,
  note: StickyNote,
  task: CheckSquare,
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


export default async function DealDetailPage({
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
        <Link href="/deals" style={backLinkStyle}>
          <ArrowLeft size={16} />
          商談一覧
        </Link>
      </div>
    );
  }

  const { data: deal, error } = await getDeal(id);

  if (error || !deal) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          商談が見つかりません
        </p>
        <Link href="/deals" style={backLinkStyle}>
          <ArrowLeft size={16} />
          商談一覧
        </Link>
      </div>
    );
  }

  const services = deal.deal_services ?? [];
  const contracts = deal.contracts ?? [];
  const activities = deal.deal_activities ?? [];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1280px", margin: "0 auto" }}>
      {/* ---- Header ---- */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/deals"
          style={{ ...backLinkStyle, marginBottom: "0.75rem" }}
        >
          <ArrowLeft size={16} />
          商談一覧
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
          {deal.deal_code && (
            <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600 }}>
              {deal.deal_code}
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
            {deal.name}
          </h1>
          <Link href={`/deals/${deal.id}/edit`} style={editButtonStyle}>
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
          <DetailSection title="基本情報" icon={FileText}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="取引名" value={deal.name} full />
              <InfoField
                label="金額"
                value={formatCurrency(deal.amount)}
              />
              <InfoField label="担当者" value={deal.owner?.full_name} />
              <InfoField
                label="取引先"
                full
                value={
                  deal.account ? (
                    <EntityLink href={`/accounts/${deal.account.id}`}>
                      {deal.account.name}
                      {deal.account.company && ` (${deal.account.company.name})`}
                    </EntityLink>
                  ) : (
                    // 契約前は取引先が無い。相手先は法人情報 / 連絡先で示す
                    (() => {
                      const cp = getDealCounterparty(deal);
                      if (!cp) return null;
                      return (
                        <span
                          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
                        >
                          <EntityLink href={cp.href}>{cp.label}</EntityLink>
                          <span
                            style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}
                          >
                            取引先は契約時に作成
                          </span>
                        </span>
                      );
                    })()
                  )
                }
              />
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
              <InfoField
                label="パイプライン"
                value={<PipelineBadge name={deal.pipeline_type?.name} />}
              />
              <InfoField
                label="ステージ"
                value={
                  <StageBadge
                    name={deal.deal_stage?.name}
                    color={deal.deal_stage?.color}
                    sortOrder={deal.deal_stage?.sort_order}
                  />
                }
              />
              <InfoField
                label="ステータス"
                value={
                  <StatusBadge
                    name={deal.deal_status?.name}
                    color={deal.deal_status?.color}
                    sortOrder={deal.deal_status?.sort_order}
                  />
                }
              />
            </div>
          </DetailSection>

          <DetailSection title="日程" icon={Calendar}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              <InfoField label="申請日" value={formatDate(deal.application_date)} />
              <InfoField
                label="審査完了日"
                value={formatDate(deal.review_completed_date)}
              />
              <InfoField
                label="クローズ予定日"
                value={
                  isOverdue(deal.expected_close_date, deal.closed_at) ? (
                    <span style={{ color: OVERDUE_TEXT, fontWeight: 600 }}>
                      {formatDate(deal.expected_close_date)}（期日超過）
                    </span>
                  ) : (
                    formatDate(deal.expected_close_date)
                  )
                }
              />
              <InfoField
                label="ステージ更新日時"
                value={formatDate(deal.stage_updated_at)}
              />
              <InfoField
                label="クローズ日時"
                value={formatDate(deal.closed_at)}
              />
            </div>
          </DetailSection>

          <DetailSection title="サービス" icon={ListChecks}>
            {services.length === 0 ? (
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {services.map((ds) => (
                  <LabelBadge key={ds.service?.id} name={ds.service?.name} />
                ))}
              </div>
            )}
          </DetailSection>

          <DetailSection title="契約" icon={FileText}>
            {contracts.length === 0 ? (
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
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.875rem",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                      <th style={thStyle}>契約コード</th>
                      <th style={thStyle}>契約書名</th>
                      <th style={thStyle}>契約方法</th>
                      <th style={thStyle}>期間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => (
                      <tr key={c.id}>
                        <td style={tdStyle}>
                          <EntityLink href={`/contracts/${c.id}`} compact>
                            {c.contract_code}
                          </EntityLink>
                        </td>
                        <td style={tdStyle}>{c.contract_name}</td>
                        <td style={tdStyle}><ContractMethodBadge method={c.contract_method} /></td>
                        <td style={tdStyle}>
                          {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>
        </div>

        {/* ======== Right ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <DetailSection title="対応履歴" icon={Clock}>
            {activities.length === 0 ? (
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
                {activities.map((a) => (
                  <div
                    key={a.id}
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
                      {(() => {
                        const Icon = activityTypeIcon[a.activity_type] ?? ClipboardList;
                        return (
                          <Icon
                            size={14}
                            style={{ color: "var(--color-sumi600)", flexShrink: 0 }}
                          />
                        );
                      })()}
                      <span
                        style={{
                          color: "var(--color-text-body)",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                        }}
                      >
                        {a.subject}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem" }}>
                        {a.crm_users?.full_name ?? "—"}
                      </span>
                      <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem" }}>
                        {formatDate(a.activity_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "left" as const,
  padding: "0.5rem",
  color: "var(--color-sumi600)",
  fontSize: "0.75rem",
  fontWeight: 600,
  backgroundColor: "var(--color-sumi50)",
};

const tdStyle = {
  padding: "0.5rem",
  color: "var(--color-text-body)",
  fontSize: "0.8125rem",
  borderBottom: "1px solid var(--color-border-default)",
};

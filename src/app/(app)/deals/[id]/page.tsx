import { getDeal } from "@/actions/deals";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  DollarSign,
  Building2,
  User,
  FileText,
  Clock,
  Pencil,
} from "lucide-react";

function formatDate(date: string | null | undefined): string {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("ja-JP");
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "\u2014";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

const activityTypeIcon: Record<string, string> = {
  call: "\u260E",
  email: "\u2709",
  meeting: "\uD83E\uDD1D",
  note: "\uD83D\uDCDD",
  task: "\u2705",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          gap: "1rem",
        }}
      >
        <p style={{ color: "var(--color-text-body)", fontSize: "1rem" }}>
          不正なパラメータです
        </p>
        <Link
          href="/deals"
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
          ディール一覧へ戻る
          <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  }

  const { data: deal, error } = await getDeal(id);

  if (error || !deal) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "50vh",
          gap: "1rem",
        }}
      >
        <p style={{ color: "var(--color-text-body)", fontSize: "1rem" }}>
          {"\u30C7\u30A3\u30FC\u30EB\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093"}
        </p>
        <Link
          href="/deals"
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
          {"\u2190 \u30C7\u30A3\u30FC\u30EB\u4E00\u89A7\u3078\u623B\u308B"}
        </Link>
      </div>
    );
  }

  const services = deal.deal_services ?? [];
  const contracts = deal.contracts ?? [];
  const activities = deal.deal_activities ?? [];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      {/* ---- Header ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        <Link
          href="/deals"
          style={{ color: "var(--color-sumi600)", display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.875rem", textDecoration: "none" }}
        >
          <ArrowLeft size={16} />
          {"\u30C7\u30A3\u30FC\u30EB\u4E00\u89A7"}
        </Link>
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
          {deal.deal_code}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ color: "var(--color-text-title)", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {deal.name}
          </h1>
          <Link
            href={`/deals/${deal.id}/edit`}
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

      {/* ---- Status Bar ---- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
        }}
      >
        {deal.pipeline_type && (
          <span
            style={{
              backgroundColor: "var(--color-sumi100)",
              borderRadius: "var(--radius-badge)",
              padding: "0.125rem 0.5rem",
              fontSize: "0.75rem",
              color: "var(--color-text-body)",
            }}
          >
            {deal.pipeline_type.name}
          </span>
        )}
        <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem" }}>{"\u2192"}</span>
        {deal.deal_stage && (
          <span
            style={{
              backgroundColor: "var(--color-sumi100)",
              borderRadius: "var(--radius-badge)",
              padding: "0.125rem 0.5rem",
              fontSize: "0.75rem",
              color: "var(--color-text-body)",
            }}
          >
            {deal.deal_stage.name}
          </span>
        )}
        <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem" }}>{"\u2192"}</span>
        {deal.deal_status && (
          <span
            style={{
              backgroundColor: "var(--color-sumi100)",
              borderRadius: "var(--radius-badge)",
              padding: "0.125rem 0.5rem",
              fontSize: "0.75rem",
              color: "var(--color-text-body)",
            }}
          >
            {deal.deal_status.name}
          </span>
        )}
      </div>

      {/* ---- 2-Column Grid ---- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ======== Left Column ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* -- Basic Info Card -- */}
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
                fontWeight: 700,
                margin: "0 0 1rem 0",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <FileText size={16} />
              {"\u57FA\u672C\u60C5\u5831"}
            </h2>

            <div
              style={{
                borderBottom: "1px solid var(--color-border-default)",
                paddingBottom: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {"\u53D6\u5F15\u540D"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {deal.name}
              </p>
            </div>

            <div
              style={{
                borderBottom: "1px solid var(--color-border-default)",
                paddingBottom: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                <DollarSign size={12} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {"\u91D1\u984D"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {formatCurrency(deal.amount)}
              </p>
            </div>

            <div
              style={{
                borderBottom: "1px solid var(--color-border-default)",
                paddingBottom: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                <Building2 size={12} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {"\u30A2\u30AB\u30A6\u30F3\u30C8"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {deal.account ? (
                  <Link
                    href={`/accounts/${deal.account.id}`}
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
                    {deal.account.name}
                    {deal.account.company && ` (${deal.account.company.name})`}
                    <ArrowUpRight size={14} />
                  </Link>
                ) : (
                  "\u2014"
                )}
              </p>
            </div>

            <div>
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                <User size={12} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {"\u62C5\u5F53\u8005"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {deal.owner?.full_name ?? "\u2014"}
              </p>
            </div>
          </div>

          {/* -- Schedule Card -- */}
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
                fontWeight: 700,
                margin: "0 0 1rem 0",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Calendar size={16} />
              {"\u65E5\u7A0B"}
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {"\u7533\u8ACB\u65E5"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {formatDate(deal.application_date)}
                </p>
              </div>
              <div>
                <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {"\u5BE9\u67FB\u5B8C\u4E86\u65E5"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {formatDate(deal.review_completed_date)}
                </p>
              </div>
              <div>
                <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {"\u30B9\u30C6\u30FC\u30B8\u66F4\u65B0\u65E5\u6642"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {formatDate(deal.stage_updated_at)}
                </p>
              </div>
              <div>
                <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {"\u30AF\u30ED\u30FC\u30BA\u65E5\u6642"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {formatDate(deal.closed_at)}
                </p>
              </div>
            </div>
          </div>

          {/* -- Services Card -- */}
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
                fontWeight: 700,
                margin: "0 0 1rem 0",
              }}
            >
              {"\u30B5\u30FC\u30D3\u30B9"}
            </h2>
            {services.length === 0 ? (
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.875rem", margin: 0 }}>
                {"\u2014"}
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {services.map((ds: any) => (
                  <span
                    key={ds.service?.id}
                    style={{
                      backgroundColor: "var(--color-sumi100)",
                      borderRadius: "var(--radius-badge)",
                      padding: "0.125rem 0.5rem",
                      fontSize: "0.75rem",
                      color: "var(--color-text-body)",
                    }}
                  >
                    {ds.service?.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* -- Contracts Card -- */}
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
                fontWeight: 700,
                margin: "0 0 1rem 0",
              }}
            >
              {"\u5951\u7D04"}
            </h2>
            {contracts.length === 0 ? (
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.875rem", margin: 0 }}>
                {"\u2014"}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                      }}
                    >
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600 }}>
                        {"\u5951\u7D04\u30B3\u30FC\u30C9"}
                      </th>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600 }}>
                        {"\u5951\u7D04\u66F8\u540D"}
                      </th>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600 }}>
                        {"\u5951\u7D04\u65B9\u6CD5"}
                      </th>
                      <th style={{ textAlign: "left", padding: "0.5rem", color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600 }}>
                        {"\u671F\u9593"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c: any) => (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: "1px solid var(--color-border-default)",
                        }}
                      >
                        <td style={{ padding: "0.5rem", color: "var(--color-text-body)" }}>
                          {c.contract_code}
                        </td>
                        <td style={{ padding: "0.5rem", color: "var(--color-text-body)" }}>
                          {c.contract_name}
                        </td>
                        <td style={{ padding: "0.5rem", color: "var(--color-text-body)" }}>
                          {c.contract_method ?? "\u2014"}
                        </td>
                        <td style={{ padding: "0.5rem", color: "var(--color-text-body)" }}>
                          {formatDate(c.start_date)} ~ {formatDate(c.end_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ======== Right Column ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* -- Activities Card -- */}
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
                fontWeight: 700,
                margin: "0 0 1rem 0",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Clock size={16} />
              {"\u5BFE\u5FDC\u5C65\u6B74"}
            </h2>
            {activities.length === 0 ? (
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.875rem", margin: 0 }}>
                {"\u2014"}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {activities.map((a: any) => (
                  <div
                    key={a.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "12px",
                      marginBottom: "4px",
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
                      <span style={{ fontSize: "1rem" }}>
                        {activityTypeIcon[a.activity_type] ?? "\uD83D\uDCCB"}
                      </span>
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
                        {a.crm_users?.full_name ?? "\u2014"}
                      </span>
                      <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem" }}>
                        {formatDate(a.activity_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

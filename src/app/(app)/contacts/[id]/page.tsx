import { getContact } from "@/actions/contacts";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Mail,
  Phone,
  Building2,
  Briefcase,
  User,
  Star,
  Pencil,
} from "lucide-react";

function formatDate(date: string | null | undefined): string {
  if (!date) return "\u2014";
  return new Date(date).toLocaleDateString("ja-JP");
}

const contactTypeBadgeStyle: Record<string, { bg: string; label: string }> = {
  individual: { bg: "var(--color-sage200, #d1e7dd)", label: "\u500B\u4EBA" },
  corporate_rep: { bg: "var(--color-terra200, #f5d0c5)", label: "\u6CD5\u4EBA\u4EE3\u8868" },
  employee: { bg: "var(--color-amber200, #ffeeba)", label: "\u5F93\u696D\u54E1" },
  other: { bg: "var(--color-sumi100)", label: "\u305D\u306E\u4ED6" },
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContactDetailPage({
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
          href="/contacts"
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
          コンタクト一覧へ戻る
          <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  }

  const { data: contact, error } = await getContact(id);
  const c = contact as any;

  if (error || !c) {
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
          {"\u30B3\u30F3\u30BF\u30AF\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093"}
        </p>
        <Link
          href="/contacts"
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
          {"\u2190 \u30B3\u30F3\u30BF\u30AF\u30C8\u4E00\u89A7\u3078\u623B\u308B"}
        </Link>
      </div>
    );
  }

  const typeBadge = contactTypeBadgeStyle[c.contact_type] ?? contactTypeBadgeStyle.other;
  const emails = c.contact_emails ?? [];
  const phones = c.contact_phones ?? [];
  const accountContacts = c.account_contacts ?? [];
  const talent = Array.isArray(c.talent) ? c.talent[0] : c.talent;
  const talentSkills = talent?.talent_skills ?? [];
  const talentCareers = talent?.talent_careers ?? [];

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
          href="/contacts"
          style={{ color: "var(--color-sumi600)", display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.875rem", textDecoration: "none" }}
        >
          <ArrowLeft size={16} />
          {"\u30B3\u30F3\u30BF\u30AF\u30C8\u4E00\u89A7"}
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
            {c.contact_code}
          </p>
          <h1 style={{ color: "var(--color-text-title)", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {c.last_name} {c.first_name}
          </h1>
        </div>
        <span
          style={{
            backgroundColor: typeBadge.bg,
            borderRadius: "var(--radius-badge)",
            padding: "0.125rem 0.5rem",
            fontSize: "0.75rem",
            color: "var(--color-text-body)",
            alignSelf: "flex-end",
          }}
        >
          {typeBadge.label}
        </span>
        <Link
          href={`/contacts/${c.id}/edit`}
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
              <User size={16} />
              {"\u57FA\u672C\u60C5\u5831"}
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div
                style={{
                  borderBottom: "1px solid var(--color-border-default)",
                  paddingBottom: "16px",
                  marginBottom: "16px",
                }}
              >
                <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {"\u59D3"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {c.last_name ?? "\u2014"}
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
                  {"\u540D"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {c.first_name ?? "\u2014"}
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
                  {"\u30D5\u30EA\u30AC\u30CA\uFF08\u59D3\uFF09"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {c.last_name_kana ?? "\u2014"}
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
                  {"\u30D5\u30EA\u30AC\u30CA\uFF08\u540D\uFF09"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {c.first_name_kana ?? "\u2014"}
                </p>
              </div>
            </div>

            <div
              style={{
                borderBottom: "1px solid var(--color-border-default)",
                paddingBottom: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {"\u30B9\u30C6\u30FC\u30BF\u30B9"}
              </p>
              <span
                style={{
                  backgroundColor: "var(--color-sumi100)",
                  borderRadius: "var(--radius-badge)",
                  padding: "0.125rem 0.5rem",
                  fontSize: "0.75rem",
                  color: "var(--color-text-body)",
                }}
              >
                {c.contact_status?.name ?? "\u2014"}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div
                style={{
                  borderBottom: "1px solid var(--color-border-default)",
                  paddingBottom: "16px",
                  marginBottom: "16px",
                }}
              >
                <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                  {"\u7A2E\u5225"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {typeBadge.label}
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
                  {"\u6240\u5C5E\u30AB\u30F3\u30D1\u30CB\u30FC"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {c.company ? (
                    <Link
                      href={`/companies/${c.company.id}`}
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
                      {c.company.name}
                      <ArrowUpRight size={14} />
                    </Link>
                  ) : (
                    "\u2014"
                  )}
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
                  {"\u90E8\u7F72"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {c.department ?? "\u2014"}
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
                  {"\u5F79\u8077"}
                </p>
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {c.job_title ?? "\u2014"}
                </p>
              </div>
            </div>

            <div>
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {"\u751F\u5E74\u6708\u65E5"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {formatDate(c.birth_date)}
              </p>
            </div>
          </div>

          {/* -- Address Card -- */}
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
              {"\u4F4F\u6240"}
            </h2>

            <div
              style={{
                borderBottom: "1px solid var(--color-border-default)",
                paddingBottom: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {"\u90F5\u4FBF\u756A\u53F7"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {c.postal_code ? `\u3012${c.postal_code}` : "\u2014"}
              </p>
            </div>

            <div>
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {"\u4F4F\u6240"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {[c.prefecture, c.city, c.street, c.building]
                  .filter(Boolean)
                  .join(" ") || "\u2014"}
              </p>
            </div>
          </div>

          {/* -- Invoice Card -- */}
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
              {"\u30A4\u30F3\u30DC\u30A4\u30B9"}
            </h2>

            <div
              style={{
                borderBottom: "1px solid var(--color-border-default)",
                paddingBottom: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {"\u767B\u9332\u6709\u7121"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {c.has_invoice_registration ? "\u767B\u9332\u6E08\u307F" : "\u672A\u767B\u9332"}
              </p>
            </div>

            <div>
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                {"\u767B\u9332\u756A\u53F7"}
              </p>
              <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                {c.invoice_registration_number ?? "\u2014"}
              </p>
            </div>
          </div>

          {/* -- Memo Card -- */}
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
              {"\u30E1\u30E2"}
            </h2>
            <p
              style={{
                color: "var(--color-text-body)",
                fontSize: "0.875rem",
                margin: 0,
                whiteSpace: "pre-wrap",
              }}
            >
              {c.internal_memo ?? "\u2014"}
            </p>
          </div>
        </div>

        {/* ======== Right Column ======== */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {/* -- Contact Info Card -- */}
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
              <Mail size={16} />
              {"\u9023\u7D61\u5148"}
            </h2>

            {/* Emails */}
            <div
              style={{
                borderBottom: "1px solid var(--color-border-default)",
                paddingBottom: "16px",
                marginBottom: "16px",
              }}
            >
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                {"\u30E1\u30FC\u30EB"}
              </p>
              {emails.length === 0 ? (
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {"\u2014"}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {emails.map((e: any) => (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {e.is_primary && <Star size={12} style={{ color: "var(--color-terra)" }} />}
                      <span
                        style={{
                          backgroundColor: "var(--color-sumi100)",
                          borderRadius: "var(--radius-badge)",
                          padding: "0.125rem 0.5rem",
                          fontSize: "0.625rem",
                          color: "var(--color-sumi600)",
                        }}
                      >
                        {e.label ?? "main"}
                      </span>
                      <span style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                        {e.email}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Phones */}
            <div>
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                <Phone size={12} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
                {"\u96FB\u8A71"}
              </p>
              {phones.length === 0 ? (
                <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0 }}>
                  {"\u2014"}
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {phones.map((p: any) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {p.is_primary && <Star size={12} style={{ color: "var(--color-terra)" }} />}
                      <span
                        style={{
                          backgroundColor: "var(--color-sumi100)",
                          borderRadius: "var(--radius-badge)",
                          padding: "0.125rem 0.5rem",
                          fontSize: "0.625rem",
                          color: "var(--color-sumi600)",
                        }}
                      >
                        {p.label ?? "main"}
                      </span>
                      <span style={{ color: "var(--color-text-body)", fontSize: "0.875rem" }}>
                        {p.phone}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* -- Account Contacts Card -- */}
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
              <Briefcase size={16} />
              {"\u6240\u5C5E\u30A2\u30AB\u30A6\u30F3\u30C8"}
            </h2>
            {accountContacts.length === 0 ? (
              <p style={{ color: "var(--color-sumi600)", fontSize: "0.875rem", margin: 0 }}>
                {"\u2014"}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {accountContacts.map((ac: any) => (
                  <div
                    key={ac.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottom: "1px solid var(--color-border-default)",
                      paddingBottom: "12px",
                    }}
                  >
                    <Link
                      href={`/accounts/${ac.account?.id}`}
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
                      {ac.account?.name ?? "\u2014"}
                      <ArrowUpRight size={14} />
                    </Link>
                    {ac.role && (
                      <span
                        style={{
                          backgroundColor: "var(--color-sumi100)",
                          borderRadius: "var(--radius-badge)",
                          padding: "0.125rem 0.5rem",
                          fontSize: "0.75rem",
                          color: "var(--color-text-body)",
                        }}
                      >
                        {ac.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* -- Talent Card (conditional) -- */}
          {talent && (
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
                <Star size={16} />
                {"\u30BF\u30EC\u30F3\u30C8\u60C5\u5831"}
              </h2>

              {/* Personality Memo */}
              {talent.personality_memo && (
                <div
                  style={{
                    borderBottom: "1px solid var(--color-border-default)",
                    paddingBottom: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    {"\u6027\u683C\u5206\u6790\u30E1\u30E2"}
                  </p>
                  <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0, whiteSpace: "pre-wrap" }}>
                    {talent.personality_memo}
                  </p>
                </div>
              )}

              {/* Strengths / Weaknesses */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div
                  style={{
                    borderBottom: "1px solid var(--color-border-default)",
                    paddingBottom: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    {"\u5F37\u307F"}
                  </p>
                  <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0, whiteSpace: "pre-wrap" }}>
                    {talent.custom_strengths ?? "\u2014"}
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
                    {"\u5F31\u307F"}
                  </p>
                  <p style={{ color: "var(--color-text-body)", fontSize: "0.875rem", margin: 0, whiteSpace: "pre-wrap" }}>
                    {talent.custom_weaknesses ?? "\u2014"}
                  </p>
                </div>
              </div>

              {/* Skills */}
              {talentSkills.length > 0 && (
                <div
                  style={{
                    borderBottom: "1px solid var(--color-border-default)",
                    paddingBottom: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    {"\u30B9\u30AD\u30EB"}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {talentSkills.map((ts: any) => (
                      <span
                        key={ts.id ?? ts.skill?.id}
                        style={{
                          backgroundColor: "var(--color-sumi100)",
                          borderRadius: "var(--radius-badge)",
                          padding: "0.125rem 0.5rem",
                          fontSize: "0.75rem",
                          color: "var(--color-text-body)",
                        }}
                      >
                        {ts.skill?.name}
                        {ts.level != null && ` Lv.${ts.level}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Careers */}
              {talentCareers.length > 0 && (
                <div>
                  <p style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                    {"\u7D4C\u6B74"}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {talentCareers.map((career: any) => (
                      <div
                        key={career.id}
                        style={{
                          borderBottom: "1px solid var(--color-border-default)",
                          paddingBottom: "12px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                          {career.career_type && (
                            <span
                              style={{
                                backgroundColor: "var(--color-sumi100)",
                                borderRadius: "var(--radius-badge)",
                                padding: "0.125rem 0.5rem",
                                fontSize: "0.625rem",
                                color: "var(--color-sumi600)",
                              }}
                            >
                              {career.career_type}
                            </span>
                          )}
                          <span style={{ color: "var(--color-text-body)", fontSize: "0.875rem", fontWeight: 600 }}>
                            {career.organization_name ?? "\u2014"}
                          </span>
                        </div>
                        <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem" }}>
                          {formatDate(career.start_date)} ~ {formatDate(career.end_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

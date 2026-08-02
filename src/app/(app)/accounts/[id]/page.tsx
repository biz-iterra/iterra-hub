import { getAccount, updateAccount } from "@/actions/accounts";
import { getCompanies } from "@/actions/companies";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { buildCompanyOptions } from "@/lib/company-options";
import { RelationField } from "@/components/ui/RelationField";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Handshake,
  Layers,
  Pencil,
  Users,
} from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { EntityLink } from "@/components/ui/EntityLink";
import { LabelBadge } from "@/components/ui/badges";
import { detailContainerStyle, detailGridStyle, fieldGridStyle, sectionStackStyle } from "@/lib/layout";

/** ステータス更新日の表示。時刻までは要らないので日付だけ出す */
function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const formatCurrency = (amount: number | null | undefined) => {
  if (amount == null) return "—";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
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

const thStyle = {
  padding: "0.5rem",
  color: "var(--color-sumi600)",
  fontSize: "0.75rem",
  fontWeight: 600,
  backgroundColor: "var(--color-sumi50)",
  textAlign: "left" as const,
};

const thRightStyle = {
  ...thStyle,
  textAlign: "right" as const,
};

const tdStyle = {
  padding: "0.5rem",
  color: "var(--color-text-body)",
  fontSize: "0.8125rem",
  borderBottom: "1px solid var(--color-border-default)",
};

const tdRightStyle = {
  ...tdStyle,
  textAlign: "right" as const,
};


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
        <Link href="/accounts" style={backLinkStyle}>
          <ArrowLeft size={16} />
          取引先一覧
        </Link>
      </div>
    );
  }

  const [
    { data: account, error },
    { data: companiesResult },
    { data: users },
    { data: me },
  ] = await Promise.all([
    getAccount(id),
    // 紐づけの付け替え用。編集ページと同じ範囲を出す
    getCompanies({ perPage: 1000 }),
    getCrmUsers(),
    getCurrentUser(),
  ]);
  const a = account;

  if (error || !a) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          取引先が見つかりません
        </p>
        <Link href="/accounts" style={backLinkStyle}>
          <ArrowLeft size={16} />
          取引先一覧
        </Link>
      </div>
    );
  }

  const contacts =
    a.contacts
      ?.map((ac) => ({
        ...ac.contact,
        role: ac.role,
      }))
      .filter((c) => c && c.deleted_at === null) ?? [];

  const deals = a.deals ?? [];

  // 紐づけの付け替え。編集ページ側からは外してあり、ここが唯一の入口になる
  const canEdit = me?.role === "admin" || a.owner_user_id === me?.id;
  const companyOptions = buildCompanyOptions(companiesResult?.rows ?? [], a.company);
  const ownerOptions = (users ?? []).map((u) => ({ value: u.id, label: u.full_name }));

  /** 楽観ロックに使う updated_at は、この画面を出した時点の値で閉じ込める */
  async function saveRelation(field: "company_id" | "owner_user_id", value: string | null) {
    "use server";
    const { error: saveError } = await updateAccount(id, {
      [field]: value,
      expected_updated_at: a?.updated_at ?? undefined,
    });
    return { error: saveError };
  }

  return (
    <div style={detailContainerStyle}>
      {/* ---- Header ---- */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link href="/accounts" style={{ ...backLinkStyle, marginBottom: "0.75rem" }}>
          <ArrowLeft size={16} />
          取引先一覧
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
          <Link href={`/accounts/${a.id}/edit`} style={editButtonStyle}>
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
          <DetailSection title="基本情報" icon={Briefcase}>
            <div
              style={fieldGridStyle}
            >
              <InfoField label="取引先名" value={a.name} />
              {/* 担当者と事業者情報は別レコードへの紐づけ。ここで直す */}
              <RelationField
                label="担当者"
                value={a.owner_user_id}
                display={a.owner?.full_name ?? null}
                options={ownerOptions}
                action={saveRelation.bind(null, "owner_user_id")}
                editable={canEdit}
              />
              <RelationField
                label="事業者情報"
                value={a.company_id}
                display={
                  a.company ? (
                    <EntityLink href={`/companies/${a.company.id}`}>
                      {a.company.name}
                    </EntityLink>
                  ) : null
                }
                options={companyOptions}
                action={saveRelation.bind(null, "company_id")}
                editable={canEdit}
              />
              <InfoField label="説明" value={a.description} full />
            </div>
          </DetailSection>

          <DetailSection title="属性情報" icon={Layers}>
            <div
              style={fieldGridStyle}
            >
              <InfoField label="種別" value={a.account_type?.name} />
              <InfoField label="ステータス" value={a.account_status?.name} />
              <InfoField label="リードソース" value={a.lead_source?.name} />
              {/* 登録番号は事業者に付くものなので事業者情報が正本。ここは読み取り */}
              <InfoField
                label="インボイス登録"
                value={a.company?.invoice_registration_number ? "登録済み" : "未登録"}
              />
              <InfoField
                label="登録番号（事業者情報）"
                value={a.company?.invoice_registration_number}
              />
              {/* いつからこの状態かが分からないと、休眠・解約の判断が追えない */}
              <InfoField
                label="ステータス更新日"
                value={formatDate(a.status_updated_at)}
              />
              <InfoField
                label="区分"
                full
                value={
                  a.account_roles && a.account_roles.length > 0 ? (
                    <span
                      style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}
                    >
                      {[...a.account_roles]
                        .sort(
                          (x, y) =>
                            (x.role_type?.sort_order ?? 0) - (y.role_type?.sort_order ?? 0)
                        )
                        .map((r) =>
                          r.role_type ? (
                            <LabelBadge
                              key={r.id}
                              name={r.role_type.name}
                              color={r.role_type.color}
                            />
                          ) : null
                        )}
                    </span>
                  ) : null
                }
              />
            </div>
          </DetailSection>

          <DetailSection title="商談一覧" icon={Handshake}>
            {deals.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>コード</th>
                    <th style={thStyle}>取引名</th>
                    <th style={thStyle}>ステージ</th>
                    <th style={thStyle}>ステータス</th>
                    <th style={thRightStyle}>金額</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal.id}>
                      <td style={tdStyle}>
                        <EntityLink href={`/deals/${deal.id}`} compact>
                          {deal.deal_code}
                        </EntityLink>
                      </td>
                      <td style={tdStyle}>{deal.name}</td>
                      <td style={tdStyle}>{deal.deal_stage?.name ?? "—"}</td>
                      <td style={tdStyle}>{deal.deal_status?.name ?? "—"}</td>
                      <td style={tdRightStyle}>{formatCurrency(deal.amount)}</td>
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
                —
              </p>
            )}
          </DetailSection>
        </div>

        {/* ======== Right ======== */}
        <div style={sectionStackStyle}>
          <DetailSection title="連絡先一覧" icon={Users}>
            {contacts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {contacts.map((contact) => (
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
                    {contact.company?.name && (
                      <span
                        style={{
                          display: "block",
                          color: "var(--color-sumi600)",
                          fontSize: "0.75rem",
                          marginTop: "0.125rem",
                        }}
                      >
                        {contact.company.name}
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

import {
  getDeal,
  updateDeal,
  addDealService,
  removeDealService,
} from "@/actions/deals";
import { getProjects, addDealProject, removeDealProject } from "@/actions/projects";
import { getServices } from "@/actions/masters";
import { RelationMultiField } from "@/components/ui/RelationMultiField";
import { RelationListSection } from "@/components/ui/RelationListSection";
import { getAccounts } from "@/actions/accounts";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { RelationField } from "@/components/ui/RelationField";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderKanban,
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
import { AddRelatedLink } from "@/components/ui/AddRelatedLink";
import { InfoField } from "@/components/ui/InfoField";
import { EntityLink } from "@/components/ui/EntityLink";
import { ACTIVITY_ICON } from "@/lib/activity";
import { getDealCounterparties } from "@/lib/deal-counterparty";
import { ContractMethodBadge, PipelineBadge, StageBadge, StatusBadge } from "@/components/ui/badges";
import { detailContainerClass, detailGridClass, fieldGridClass, sectionStackClass, tableScrollClass } from "@/lib/layout";

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

  const [
    { data: deal, error },
    { data: accountsResult },
    { data: projectsResult },
    { data: serviceMaster },
    { data: users },
    { data: me },
  ] =
    await Promise.all([
      getDeal(id),
      // 紐づけの付け替え用。編集ページと同じ範囲を出す
      getAccounts({ perPage: 1000 }),
      getProjects({ perPage: 1000 }),
      getServices(),
      getCrmUsers(),
      getCurrentUser(),
    ]);

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

  // 紐づけの付け替え。編集ページ側からは外してあり、ここが唯一の入口になる
  const canEdit = me?.role === "admin" || deal.owner_user_id === me?.id;
  const accountOptions = (accountsResult?.rows ?? []).map((a) => ({
    value: a.id,
    label: a.account_code ? `${a.account_code} ${a.name}` : a.name,
  }));
  const ownerOptions = (users ?? []).map((u) => ({ value: u.id, label: u.full_name }));

  /** 楽観ロックに使う updated_at は、この画面を出した時点の値で閉じ込める */
  async function saveRelation(field: "account_id" | "owner_user_id", value: string | null) {
    "use server";
    const { error: saveError } = await updateDeal(id, {
      [field]: value,
      expected_updated_at: deal?.updated_at ?? undefined,
    });
    return { error: saveError };
  }

  const services = deal.deal_services ?? [];
  const linkedProjects = (deal.deal_projects ?? []).filter(
    (dp) => dp.project && dp.project.deleted_at === null
  );
  const linkedProjectIds = new Set(linkedProjects.map((dp) => dp.project!.id));

  /**
   * 商談で扱うサービス。中間テーブルを 1 行ずつ足し外しする API しか無いので、
   * 選び直しの結果と今の状態の差分だけを送る。
   */
  async function saveServices(values: string[]) {
    "use server";
    const current = new Set(
      (deal?.deal_services ?? []).map((ds) => ds.service?.id).filter(Boolean) as string[]
    );
    const next = new Set(values);
    for (const serviceId of next) {
      if (current.has(serviceId)) continue;
      const { error: addError } = await addDealService({
        deal_id: id,
        service_id: serviceId,
      });
      if (addError) return { error: addError };
    }
    for (const serviceId of current) {
      if (next.has(serviceId)) continue;
      const { error: removeError } = await removeDealService(id, serviceId);
      if (removeError) return { error: removeError };
    }
    return { error: null };
  }

  async function addProject(projectId: string) {
    "use server";
    const { error: saveError } = await addDealProject({ deal_id: id, project_id: projectId });
    return { error: saveError };
  }

  async function removeProject(projectId: string) {
    "use server";
    const { error: saveError } = await removeDealProject(id, projectId);
    return { error: saveError };
  }
  const contracts = deal.contracts ?? [];
  const activities = deal.deal_activities ?? [];

  return (
    <div className={detailContainerClass}>
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
        className={detailGridClass}
      >
        {/* ======== Left ======== */}
        <div className={sectionStackClass}>
          <DetailSection title="基本情報" icon={FileText}>
            <div
              className={fieldGridClass}
            >
              <InfoField label="取引名" value={deal.name} full />
              <InfoField
                label="金額"
                value={formatCurrency(deal.amount)}
              />
              <RelationField
                label="担当者"
                value={deal.owner_user_id}
                display={deal.owner?.full_name ?? null}
                options={ownerOptions}
                action={saveRelation.bind(null, "owner_user_id")}
                editable={canEdit}
              />
              <RelationField
                label="取引先"
                full
                value={deal.account_id}
                nullable={false}
                // 取引先は契約成立時に作られる。まだ無い商談で選ばせると
                // 契約前に取引先が増えてしまうので、その場合は案内だけ出す
                editable={canEdit && Boolean(deal.account_id)}
                options={accountOptions}
                searchKind="account"
                action={saveRelation.bind(null, "account_id")}
                display={
                  deal.account ? (
                    <EntityLink href={`/accounts/${deal.account.id}`}>
                      {deal.account.name}
                      {deal.account.company && ` (${deal.account.company.name})`}
                    </EntityLink>
                  ) : (
                    // 契約前は取引先が無い。相手先は事業者情報 / 連絡先で示す。
                    // **両方紐づいていれば両方出す**（「Ａ社のＢさん」。1 件だけ返す
                    // getDealCounterparty を使うと連絡先が事業者情報の陰に隠れる。T-0064）
                    (() => {
                      const parties = getDealCounterparties(deal);
                      if (parties.length === 0) return null;
                      return (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {parties.map((cp) => (
                            <EntityLink key={cp.kind} href={cp.href}>
                              {cp.label}
                            </EntityLink>
                          ))}
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
              className={fieldGridClass}
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
              className={fieldGridClass}
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

          {/* サービスはマスタへの紐づけ。詳細ページを持たないのでチップで選ぶ */}
          <DetailSection title="サービス" icon={ListChecks}>
            <RelationMultiField
              label="扱うサービス"
              values={
                services.map((ds) => ds.service?.id).filter(Boolean) as string[]
              }
              options={(serviceMaster ?? []).map((sv) => ({
                value: sv.id,
                label: sv.name,
              }))}
              action={saveServices}
              editable={canEdit}
            />
          </DetailSection>

          {/* 商談とプロジェクトは多対多。編集ページから移した */}
          <DetailSection title="プロジェクト" icon={FolderKanban}>
            <RelationListSection
              label="プロジェクト"
              rows={linkedProjects.map((dp) => ({
                id: dp.project!.id,
                href: `/projects/${dp.project!.id}`,
                label: dp.project!.name,
                code: dp.project!.project_code,
                badge: dp.project!.project_status?.name,
              }))}
              options={(projectsResult?.rows ?? [])
                .filter((pj) => !linkedProjectIds.has(pj.id))
                .map((pj) => ({
                  value: pj.id,
                  label: pj.project_code ? `${pj.project_code} ${pj.name}` : pj.name,
                }))}
              searchKind="project"
              onAdd={addProject}
              onRemove={removeProject}
              editable={canEdit}
            />
          </DetailSection>

          <DetailSection
            title="契約"
            icon={FileText}
            action={
              <AddRelatedLink
                href={`/contracts/new?deal_id=${deal.id}`}
                label="契約を追加"
              />
            }
          >
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
              <div className={tableScrollClass}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.875rem",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                      <th style={thStyle}>契約名</th>
                      <th style={thStyle}>契約方法</th>
                      <th style={thStyle}>期間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => (
                      <tr key={c.id}>
                        {/* 契約名は自動生成。契約書名が未入力でもコードで特定できる */}
                        <td style={tdStyle}>
                          <EntityLink href={`/contracts/${c.id}`} compact>
                            {c.contract_display_name ?? c.contract_name ?? c.contract_code}
                          </EntityLink>
                        </td>
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
        <div className={sectionStackClass}>
          {/* サイドバーの「アクティビティ」と同じアイコンで揃える */}
          <DetailSection title="アクティビティ" icon={ACTIVITY_ICON}>
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

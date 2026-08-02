import {
  getProject,
  updateProject,
  addProjectMember,
  removeProjectMember,
  addDealProject,
  removeDealProject,
} from "@/actions/projects";
import { getDeals } from "@/actions/deals";
import { RelationListSection } from "@/components/ui/RelationListSection";
import { ProjectDealsSection } from "./project-deals-section";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
import { RelationField } from "@/components/ui/RelationField";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FolderKanban, Users, Handshake, Pencil, StickyNote } from "lucide-react";
import { ProjectStatusBadge, PipelineBadge, StageBadge } from "@/components/ui/badges";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { detailContainerStyle, detailGridStyle, fieldGridStyle, sectionStackStyle } from "@/lib/layout";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>不正なパラメータです</p>
        <Link
          href="/projects"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          プロジェクト一覧へ戻る
        </Link>
      </div>
    );
  }

  const [{ data: project, error }, { data: users }, { data: me }, { data: dealsResult }] =
    await Promise.all([
      getProject(id),
      getCrmUsers(),
      getCurrentUser(),
      // 紐づけの付け替え用
      getDeals({ perPage: 1000 }),
    ]);
  if (error || !project) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          プロジェクトが見つかりません
        </p>
        {error && (
          <p style={{ color: "var(--color-error)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            詳細: {error}
          </p>
        )}
        <Link
          href="/projects"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          プロジェクト一覧へ戻る
        </Link>
      </div>
    );
  }

  // deal_projects.deal は論理削除済みも返るため除外する。
  // 型ガードで null を落として以降の参照を安全にする。
  type ProjectDeal = NonNullable<(typeof project.deal_projects)[number]["deal"]>;
  const deals = (project.deal_projects ?? [])
    .map((dp) => dp.deal)
    .filter((d): d is ProjectDeal => d !== null && d.deleted_at === null);
  const members = project.project_members ?? [];
  const totalAmount = deals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  // 紐づけの付け替え。プロジェクトの中身をいじるのは manager 以上
  const canEdit = me?.role === "manager" || me?.role === "admin";
  const memberUserIds = new Set(members.map((m) => m.user?.id).filter(Boolean) as string[]);
  const linkedDealIds = new Set(deals.map((d) => d.id));

  async function addMember(userId: string) {
    "use server";
    const { error: saveError } = await addProjectMember({
      project_id: id,
      user_id: userId,
    });
    return { error: saveError };
  }

  async function removeMember(userId: string) {
    "use server";
    const { error: saveError } = await removeProjectMember(id, userId);
    return { error: saveError };
  }

  async function addDeal(dealId: string) {
    "use server";
    const { error: saveError } = await addDealProject({
      deal_id: dealId,
      project_id: id,
    });
    return { error: saveError };
  }

  async function removeDeal(dealId: string) {
    "use server";
    const { error: saveError } = await removeDealProject(dealId, id);
    return { error: saveError };
  }

  return (
    <div style={detailContainerStyle}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/projects"
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
          プロジェクト一覧
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ color: "var(--color-sumi600)", fontSize: "0.75rem", fontWeight: 600 }}>
            {project.project_code}
          </span>
          <h1 style={{ color: "var(--color-text-title)", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            {project.name}
          </h1>
          {project.project_status?.name && (
            <ProjectStatusBadge name={project.project_status.name} color={project.project_status.color} sortOrder={project.project_status.sort_order} seed={project.project_status.id} />
          )}
          <Link
            href={`/projects/${project.id}/edit`}
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

      {/* 上段: 基本情報（左）+ メンバー（右） */}
      <div style={{ ...detailGridStyle, marginBottom: "1.5rem" }}>
        <div style={{ ...sectionStackStyle, minWidth: 0 }}>
          <DetailSection title="基本情報" icon={FolderKanban}>
            <div style={fieldGridStyle}>
              <InfoField label="プロジェクト名" value={project.name} />
              <InfoField label="ステータス" value={project.project_status?.name} />
              <InfoField label="開始日" value={project.start_date} />
              <InfoField label="終了予定日" value={project.end_date} />
              {/* 責任者は別レコードへの紐づけ。ここで直す（変更は manager 以上） */}
              <RelationField
                label="責任者"
                value={project.owner_user_id}
                display={project.owner?.full_name ?? null}
                options={(users ?? []).map((u) => ({ value: u.id, label: u.full_name }))}
                action={async (value: string | null) => {
                  "use server";
                  const { error: saveError } = await updateProject(id, {
                    owner_user_id: value,
                    expected_updated_at: project?.updated_at ?? undefined,
                  });
                  return { error: saveError };
                }}
                editable={me?.role === "manager" || me?.role === "admin"}
              />
              <InfoField
                label="作成日"
                value={project.created_at ? new Date(project.created_at).toLocaleDateString("ja-JP") : null}
              />
              {/* いつからこの状態かが分からないと、保留・中止の判断が追えない */}
              <InfoField
                label="ステータス更新日"
                value={
                  project.status_updated_at
                    ? new Date(project.status_updated_at).toLocaleDateString("ja-JP")
                    : null
                }
              />
              <InfoField label="有効" value={project.is_active ? "有効" : "無効"} />
              <InfoField label="説明" value={project.description} full />
            </div>
          </DetailSection>

          {project.internal_memo && (
            <DetailSection title="メモ" icon={StickyNote}>
              <InfoField label="社内メモ" value={project.internal_memo} />
            </DetailSection>
          )}
        </div>

        <div style={{ ...sectionStackStyle, minWidth: 0 }}>
          {/* メンバーは crm_users への紐づけ。編集ページから移した */}
          <DetailSection title={`メンバー（${members.length}名）`} icon={Users}>
            <RelationListSection
              label="メンバー"
              rows={members
                .filter((m) => m.user)
                .map((m) => ({
                  id: m.user!.id,
                  href: `/admin/members`,
                  label: m.user!.full_name,
                  badge: m.user!.role,
                }))}
              options={(users ?? [])
                .filter((u) => !memberUserIds.has(u.id))
                .map((u) => ({ value: u.id, label: u.full_name }))}
              onAdd={addMember}
              onRemove={removeMember}
              editable={canEdit}
            />
          </DetailSection>
        </div>
      </div>

      {/* 下段: 紐づく商談（全幅）。多対多なのでここから足し外しできる */}
      <ProjectDealsSection
        projectId={id}
        deals={deals.map((d) => ({
          id: d.id,
          deal_code: d.deal_code,
          name: d.name,
          pipeline_name: d.pipeline_type?.name ?? null,
          stage_name: d.deal_stage?.name ?? null,
          stage_color: d.deal_stage?.color ?? null,
          stage_sort_order: d.deal_stage?.sort_order ?? null,
          amount: d.amount,
          account_name: d.account?.name ?? null,
        }))}
        options={(dealsResult?.rows ?? [])
          .filter((d) => !linkedDealIds.has(d.id))
          .map((d) => ({
            value: d.id,
            label:
              `${d.deal_code} ${d.name}` +
              (d.account?.name ? ` / ${d.account.name}` : ""),
          }))}
        editable={canEdit}
      />
    </div>
  );
}

import { getProject } from "@/actions/projects";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FolderKanban, Users, Handshake, Pencil, StickyNote } from "lucide-react";
import { ProjectStatusBadge, PipelineBadge, StageBadge } from "@/components/ui/badges";
import { DetailSection } from "@/components/ui/DetailSection";
import { InfoField } from "@/components/ui/InfoField";
import { detailContainerStyle, detailGridStyle, fieldGridStyle } from "@/lib/layout";

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

  const { data: project, error } = await getProject(id);
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
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
          <DetailSection title="基本情報" icon={FolderKanban}>
            <div style={fieldGridStyle}>
              <InfoField label="プロジェクト名" value={project.name} />
              <InfoField label="ステータス" value={project.project_status?.name} />
              <InfoField label="開始日" value={project.start_date} />
              <InfoField label="終了予定日" value={project.end_date} />
              <InfoField label="責任者" value={project.owner?.full_name} />
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

        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", minWidth: 0 }}>
          {/* メンバー（閲覧のみ） */}
          <DetailSection title={`メンバー（${members.length}名）`} icon={Users}>
            {members.length > 0 ? (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {members.map((m) => (
                  <li
                    key={m.id}
                    style={{
                      padding: "0.5rem 0",
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                  >
                    <div style={{ fontSize: "0.875rem", color: "var(--color-text-body)" }}>
                      {m.user?.full_name ?? "(不明)"}
                    </div>
                    {m.user?.role && (
                      <div style={{ fontSize: "0.7rem", color: "var(--color-sumi600)" }}>
                        {m.user.role}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>
                メンバーなし
              </p>
            )}
            <p
              style={{
                fontSize: "0.7rem",
                color: "var(--color-sumi600)",
                marginTop: "0.75rem",
                marginBottom: 0,
              }}
            >
              ※ 追加・解除は編集ページから
            </p>
          </DetailSection>
        </div>
      </div>

      {/* 下段: 紐づく商談（閲覧のみ、全幅） */}
      <DetailSection
        title={`紐づく商談（${deals.length}件）`}
        icon={Handshake}
        action={
          <span style={{ fontSize: "0.75rem", color: "var(--color-sumi600)" }}>
            合計金額: ¥{totalAmount.toLocaleString()}
          </span>
        }
      >
        {deals.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["コード", "商談名", "パイプライン", "ステージ", "金額", "取引先"].map((h) => (
                    <th
                      key={h}
                      style={{
                        backgroundColor: "var(--color-sumi50)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "var(--color-sumi700)",
                        padding: "0.5rem",
                        textAlign: "left",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id}>
                    <td style={{ borderBottom: "1px solid var(--color-border-default)", padding: "0.5rem" }}>
                      <Link
                        href={`/deals/${d.id}`}
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
                          fontSize: "0.875rem",
                        }}
                      >
                        {d.deal_code}
                        <ArrowUpRight size={14} />
                      </Link>
                    </td>
                    <td style={{ borderBottom: "1px solid var(--color-border-default)", padding: "0.5rem", fontSize: "0.875rem" }}>
                      {d.name}
                    </td>
                    <td style={{ borderBottom: "1px solid var(--color-border-default)", padding: "0.5rem", fontSize: "0.875rem" }}>
                      <PipelineBadge name={d.pipeline_type?.name} />
                    </td>
                    <td style={{ borderBottom: "1px solid var(--color-border-default)", padding: "0.5rem", fontSize: "0.875rem" }}>
                      <StageBadge name={d.deal_stage?.name} color={d.deal_stage?.color} sortOrder={d.deal_stage?.sort_order} />
                    </td>
                    <td style={{ borderBottom: "1px solid var(--color-border-default)", padding: "0.5rem", fontSize: "0.875rem" }}>
                      {d.amount != null ? `¥${d.amount.toLocaleString()}` : "-"}
                    </td>
                    <td style={{ borderBottom: "1px solid var(--color-border-default)", padding: "0.5rem", fontSize: "0.875rem" }}>
                      {d.account?.name ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>
            まだ商談が紐づいていません
          </p>
        )}
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--color-sumi600)",
            marginTop: "0.75rem",
            marginBottom: 0,
          }}
        >
          ※ 追加・解除は編集ページから
        </p>
      </DetailSection>
    </div>
  );
}

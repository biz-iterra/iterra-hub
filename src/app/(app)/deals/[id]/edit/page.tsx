import Link from "next/link";
import { getDeal } from "@/actions/deals";
import {
  getPipelineTypes,
  getDealStages,
  getDealStatuses,
} from "@/actions/masters";
import { getCurrentUser } from "@/actions/users";
import { DealEditForm } from "./deal-edit-form";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DealEditPage({
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
          href="/deals"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          商談一覧へ戻る
        </Link>
      </div>
    );
  }

  const [
    dealResult,
    pipelineTypesResult,
    dealStagesResult,
    dealStatusesResult,
    meResult,
  ] = await Promise.all([
    getDeal(id),
    getPipelineTypes(),
    getDealStages(),
    getDealStatuses(),
    getCurrentUser(),
  ]);

  const deal = dealResult.data;
  if (!deal) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          商談が見つかりません
        </p>
        <Link
          href="/deals"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          商談一覧へ戻る
        </Link>
      </div>
    );
  }

  type MasterItem = { id: string; name: string };
  type StageItem = { id: string; name: string; pipeline_type_id: string };
  type StatusItem = { id: string; name: string; pipeline_type_id: string };

  const masters = {
    pipelineTypes: ((pipelineTypesResult.data ?? []) as MasterItem[]).map(
      (p) => ({ value: p.id, label: p.name })
    ),
    dealStages: ((dealStagesResult.data ?? []) as StageItem[]).map((s) => ({
      value: s.id,
      label: s.name,
      pipeline_type_id: s.pipeline_type_id,
    })),
    dealStatuses: ((dealStatusesResult.data ?? []) as StatusItem[]).map(
      (s) => ({
        value: s.id,
        label: s.name,
        pipeline_type_id: s.pipeline_type_id,
      })
    ),
  };

  const role = meResult.data?.role;
  const isAdmin = role === "admin";
  // contracts の書き込みは manager 以上（RLS と Server Action の条件に合わせる）
  const canManageContracts = role === "manager" || role === "admin";

  return (
    <DealEditForm
      deal={{
        id: deal.id,
        name: deal.name,
        pipeline_type_id: deal.pipeline_type_id,
        deal_stage_id: deal.deal_stage_id,
        deal_status_id: deal.deal_status_id,
        amount: deal.amount,
        application_date: deal.application_date,
        review_completed_date: deal.review_completed_date,
        expected_close_date: deal.expected_close_date,
        closed_at: deal.closed_at,
        updated_at: deal.updated_at,
      }}
      masters={masters}
      isAdmin={isAdmin}
      contracts={deal.contracts ?? []}
      canManageContracts={canManageContracts}
    />
  );
}

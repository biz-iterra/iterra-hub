import Link from "next/link";
import { getDeal } from "@/actions/deals";
import {
  getPipelineTypes,
  getDealStages,
  getDealStatuses,
} from "@/actions/masters";
import { getAccounts } from "@/actions/accounts";
import { getCrmUsers, getCurrentUser } from "@/actions/users";
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
          ディール一覧へ戻る
        </Link>
      </div>
    );
  }

  const [
    dealResult,
    pipelineTypesResult,
    dealStagesResult,
    dealStatusesResult,
    accountsResult,
    usersResult,
    meResult,
  ] = await Promise.all([
    getDeal(id),
    getPipelineTypes(),
    getDealStages(),
    getDealStatuses(),
    getAccounts({ perPage: 1000 }),
    getCrmUsers(),
    getCurrentUser(),
  ]);

  const deal = dealResult.data;
  if (!deal) {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          ディールが見つかりません
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
          ディール一覧へ戻る
        </Link>
      </div>
    );
  }

  type MasterItem = { id: string; name: string };
  type StageItem = { id: string; name: string; pipeline_type_id: string };
  type StatusItem = { id: string; name: string; pipeline_type_id: string };
  type AccountItem = { id: string; account_code: string | null; name: string };

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
    accounts: (
      ((accountsResult.data?.rows ?? []) as AccountItem[])
    ).map((a) => ({
      value: a.id,
      label: a.account_code ? `${a.account_code} ${a.name}` : a.name,
    })),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
  };

  const isAdmin = meResult.data?.role === "admin";

  return (
    <DealEditForm
      deal={{
        id: deal.id,
        name: deal.name,
        pipeline_type_id: deal.pipeline_type_id,
        deal_stage_id: deal.deal_stage_id,
        deal_status_id: deal.deal_status_id,
        amount: deal.amount,
        account_id: deal.account_id,
        owner_user_id: deal.owner_user_id,
        contract_name: deal.contract_name,
        application_date: deal.application_date,
        review_completed_date: deal.review_completed_date,
        closed_at: deal.closed_at,
      }}
      masters={masters}
      isAdmin={isAdmin}
    />
  );
}

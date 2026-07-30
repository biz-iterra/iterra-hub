import {
  getPipelineTypes,
  getDealStages,
  getDealStatuses,
} from "@/actions/masters";
import { getAccounts } from "@/actions/accounts";
import { getCrmUsers } from "@/actions/users";
import { DealNewForm } from "./deal-new-form";

export default async function DealNewPage() {
  const [
    pipelineTypesResult,
    dealStagesResult,
    dealStatusesResult,
    accountsResult,
    usersResult,
  ] = await Promise.all([
    getPipelineTypes(),
    getDealStages(),
    getDealStatuses(),
    getAccounts({ perPage: 1000 }),
    getCrmUsers(),
  ]);

  type PipelineItem = {
    id: string;
    name: string;
    default_close_months: number | null;
  };
  type StageItem = { id: string; name: string; pipeline_type_id: string };
  type StatusItem = { id: string; name: string; pipeline_type_id: string };
  type AccountItem = { id: string; account_code: string | null; name: string };

  const masters = {
    pipelineTypes: ((pipelineTypesResult.data ?? []) as PipelineItem[]).map(
      (p) => ({
        value: p.id,
        label: p.name,
        default_close_months: p.default_close_months,
      })
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
    accounts: ((accountsResult.data?.rows ?? []) as AccountItem[]).map((a) => ({
      value: a.id,
      label: a.account_code ? `${a.account_code} ${a.name}` : a.name,
    })),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
  };

  return <DealNewForm masters={masters} />;
}

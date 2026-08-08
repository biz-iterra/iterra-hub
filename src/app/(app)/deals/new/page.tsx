import {
  getPipelineTypes,
  getDealStages,
  getDealStatuses,
  getLeadStages,
  getLeadSources,
  getAccountTypes,
} from "@/actions/masters";
import { getCompanies } from "@/actions/companies";
import { getContacts } from "@/actions/contacts";
import { getCrmUsers } from "@/actions/users";
import { DealNewForm } from "./deal-new-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 商談の新規作成。
 *
 * **商談はリードから始まる**（T-0070）。既存のリードを選ぶか、その場で作る。
 * 相手先（事業者情報・連絡先）はリードから自動で埋まり、選び直せる。
 * **取引先は選ばせない**（契約成立時に自動で作られる）。
 *
 * 各詳細から「商談を追加」で来たときは `?company_id=` / `?contact_id=` /
 * `?lead_id=` が渡り、初期選択になる。
 */
export default async function DealNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pick = (key: string) => {
    const raw = Array.isArray(params[key]) ? params[key]?.[0] : params[key];
    return raw && UUID_RE.test(raw) ? raw : "";
  };
  const initialCompanyId = pick("company_id");
  const initialContactId = pick("contact_id");
  const initialProjectId = pick("project_id");
  const initialLeadId = pick("lead_id");

  const [
    pipelineTypesResult,
    dealStagesResult,
    dealStatusesResult,
    companiesResult,
    contactsResult,
    usersResult,
    leadStagesResult,
    leadSourcesResult,
    accountTypesResult,
  ] = await Promise.all([
    getPipelineTypes(),
    getDealStages(),
    getDealStatuses(),
    getCompanies({ perPage: 1000 }),
    getContacts({ perPage: 1000 }),
    getCrmUsers(),
    getLeadStages(),
    getLeadSources(),
    getAccountTypes(),
  ]);

  type PipelineItem = {
    id: string;
    name: string;
    default_close_months: number | null;
  };
  type StageItem = { id: string; name: string; pipeline_type_id: string };
  type StatusItem = { id: string; name: string; pipeline_type_id: string };
  type LeadStageItem = {
    id: string;
    name: string;
    is_deal_ready: boolean;
    requires_deal: boolean;
    sort_order: number;
  };
  type SimpleMaster = { id: string; name: string };

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
    companies: ((companiesResult.data?.rows ?? []) as { id: string; name: string }[]).map(
      (c) => ({ value: c.id, label: c.name })
    ),
    contacts: (
      (contactsResult.data?.rows ?? []) as {
        id: string;
        last_name: string | null;
        first_name: string | null;
      }[]
    ).map((c) => ({
      value: c.id,
      label: [c.last_name, c.first_name].filter(Boolean).join(" ") || "（名称未設定）",
    })),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
    // 商談を作れる段階かの判定と、TQL 未満のリードを上げる先の決定に使う
    leadStages: ((leadStagesResult.data ?? []) as LeadStageItem[]).map((s) => ({
      id: s.id,
      name: s.name,
      is_deal_ready: s.is_deal_ready,
      requires_deal: s.requires_deal,
      sort_order: s.sort_order,
    })),
    accountTypes: ((accountTypesResult.data ?? []) as SimpleMaster[]).map((a) => ({
      value: a.id,
      label: a.name,
    })),
    leadSources: ((leadSourcesResult.data ?? []) as SimpleMaster[]).map((l) => ({
      value: l.id,
      label: l.name,
    })),
  };

  return (
    <DealNewForm
      masters={masters}
      initialCompanyId={initialCompanyId}
      initialContactId={initialContactId}
      initialProjectId={initialProjectId}
      initialLeadId={initialLeadId}
    />
  );
}

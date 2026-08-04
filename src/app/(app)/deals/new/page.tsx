import {
  getPipelineTypes,
  getDealStages,
  getDealStatuses,
} from "@/actions/masters";
import { getAccounts } from "@/actions/accounts";
import { getCompanies } from "@/actions/companies";
import { getContacts } from "@/actions/contacts";
import { getCrmUsers } from "@/actions/users";
import { DealNewForm } from "./deal-new-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 商談の新規作成。
 *
 * 相手先は取引先・事業者情報・連絡先のいずれでもよい（取引先は契約成立まで
 * 存在しないため）。各詳細から「商談を追加」で来たときは
 * `?account_id=` / `?company_id=` / `?contact_id=` が渡り、初期選択になる。
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
  const initialAccountId = pick("account_id");
  const initialCompanyId = pick("company_id");
  const initialContactId = pick("contact_id");
  const initialProjectId = pick("project_id");

  const [
    pipelineTypesResult,
    dealStagesResult,
    dealStatusesResult,
    accountsResult,
    companiesResult,
    contactsResult,
    usersResult,
  ] = await Promise.all([
    getPipelineTypes(),
    getDealStages(),
    getDealStatuses(),
    getAccounts({ perPage: 1000 }),
    getCompanies({ perPage: 1000 }),
    getContacts({ perPage: 1000 }),
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
  };

  return (
    <DealNewForm
      masters={masters}
      initialAccountId={initialAccountId}
      initialCompanyId={initialCompanyId}
      initialContactId={initialContactId}
      initialProjectId={initialProjectId}
    />
  );
}

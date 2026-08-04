import { getContactStatuses, getLeadSources } from "@/actions/masters";
import { getCompanies } from "@/actions/companies";
import { getCrmUsers } from "@/actions/users";
import { ContactNewForm } from "./contact-new-form";

/**
 * 連絡先の新規作成。
 *
 * 事業者情報・取引先の詳細から「連絡先を追加」で来たときは、
 * `?company_id=` / `?account_id=` で相手が渡る。**親を初期選択にするだけで
 * 固定はしない**（間違えた導線から来たときに直せなくなるため）。
 */
export default async function ContactNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // 不正な値は黙って無視する（初期選択が外れるだけで、作成自体は行える）
  const initialCompanyId = UUID_RE.test(first(params.company_id))
    ? first(params.company_id)
    : "";
  const initialAccountId = UUID_RE.test(first(params.account_id))
    ? first(params.account_id)
    : "";

  const [
    contactStatusesResult,
    leadSourcesResult,
    companiesResult,
    usersResult,
  ] = await Promise.all([
    getContactStatuses(),
    getLeadSources(),
    getCompanies({ perPage: 1000 }),
    getCrmUsers(),
  ]);

  type MasterItem = { id: string; name: string };
  type CompanyItem = { id: string; name: string };

  const masters = {
    contactStatuses: ((contactStatusesResult.data ?? []) as MasterItem[]).map(
      (s) => ({ value: s.id, label: s.name })
    ),
    leadSources: ((leadSourcesResult.data ?? []) as MasterItem[]).map((l) => ({
      value: l.id,
      label: l.name,
    })),
    companies: ((companiesResult.data?.rows ?? []) as CompanyItem[]).map(
      (c) => ({ value: c.id, label: c.name })
    ),
    owners: (usersResult.data ?? []).map((u) => ({
      value: u.id,
      label: u.full_name,
    })),
  };

  return (
    <ContactNewForm
      masters={masters}
      initialCompanyId={initialCompanyId}
      initialAccountId={initialAccountId}
    />
  );
}

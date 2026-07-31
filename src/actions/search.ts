"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchResultType =
  | "lead"
  | "deal"
  | "account"
  | "company"
  | "contact"
  | "contract"
  | "project"
  | "campaign";

export type SearchResult = {
  type: SearchResultType;
  typeLabel: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

const RESULT_LIMIT = 5;

const TYPE_LABELS: Record<SearchResultType, string> = {
  lead: "リード",
  deal: "商談",
  account: "取引先",
  company: "法人情報",
  contact: "連絡先",
  contract: "契約",
  project: "プロジェクト",
  campaign: "キャンペーン",
};

/**
 * ヘッダーの横断検索（グローバル検索）。
 *
 * 認証済みユーザーのみ実行可能。通常の server クライアントを使うため、
 * RLS がそのままアクセス範囲を制御する（member は自分の担当分のみ等）。
 * 各エンティティ最大 5 件、論理削除済み（deleted_at が非NULL）は除外する。
 */
export async function globalSearch(query: string): Promise<SearchResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const q = query.trim();
  if (q.length < 2) return [];

  const like = `%${q}%`;

  const [
    leadsRes,
    dealsRes,
    accountsRes,
    companiesRes,
    contactsRes,
    contractsRes,
    projectsRes,
    campaignsRes,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id, lead_name, contact_email")
      .is("deleted_at", null)
      .or(`lead_name.ilike.${like},contact_email.ilike.${like}`)
      .limit(RESULT_LIMIT),
    supabase
      .from("deals")
      .select("id, name")
      .is("deleted_at", null)
      .ilike("name", like)
      .limit(RESULT_LIMIT),
    supabase
      .from("accounts")
      .select("id, name")
      .is("deleted_at", null)
      .ilike("name", like)
      .limit(RESULT_LIMIT),
    supabase
      .from("companies")
      .select("id, name")
      .is("deleted_at", null)
      .ilike("name", like)
      .limit(RESULT_LIMIT),
    supabase
      .from("contacts")
      .select("id, last_name, first_name")
      .is("deleted_at", null)
      .or(`last_name.ilike.${like},first_name.ilike.${like}`)
      .limit(RESULT_LIMIT),
    supabase
      .from("contracts")
      .select("id, contract_name")
      .is("deleted_at", null)
      .ilike("contract_name", like)
      .limit(RESULT_LIMIT),
    supabase
      .from("projects")
      .select("id, name")
      .is("deleted_at", null)
      .ilike("name", like)
      .limit(RESULT_LIMIT),
    supabase
      .from("campaigns")
      .select("id, name")
      .is("deleted_at", null)
      .ilike("name", like)
      .limit(RESULT_LIMIT),
  ]);

  const results: SearchResult[] = [];

  for (const row of leadsRes.data ?? []) {
    results.push({
      type: "lead",
      typeLabel: TYPE_LABELS.lead,
      id: row.id,
      title: row.lead_name,
      subtitle: row.contact_email,
      href: `/leads/${row.id}`,
    });
  }

  for (const row of dealsRes.data ?? []) {
    results.push({
      type: "deal",
      typeLabel: TYPE_LABELS.deal,
      id: row.id,
      title: row.name,
      subtitle: null,
      href: `/deals/${row.id}`,
    });
  }

  for (const row of accountsRes.data ?? []) {
    results.push({
      type: "account",
      typeLabel: TYPE_LABELS.account,
      id: row.id,
      title: row.name,
      subtitle: null,
      href: `/accounts/${row.id}`,
    });
  }

  for (const row of companiesRes.data ?? []) {
    results.push({
      type: "company",
      typeLabel: TYPE_LABELS.company,
      id: row.id,
      title: row.name,
      subtitle: null,
      href: `/companies/${row.id}`,
    });
  }

  for (const row of contactsRes.data ?? []) {
    results.push({
      type: "contact",
      typeLabel: TYPE_LABELS.contact,
      id: row.id,
      title: `${row.last_name}${row.first_name}`,
      subtitle: null,
      href: `/contacts/${row.id}`,
    });
  }

  for (const row of contractsRes.data ?? []) {
    results.push({
      type: "contract",
      typeLabel: TYPE_LABELS.contract,
      id: row.id,
      title: row.contract_name ?? "(契約名未設定)",
      subtitle: null,
      href: `/contracts/${row.id}`,
    });
  }

  for (const row of projectsRes.data ?? []) {
    results.push({
      type: "project",
      typeLabel: TYPE_LABELS.project,
      id: row.id,
      title: row.name,
      subtitle: null,
      href: `/projects/${row.id}`,
    });
  }

  for (const row of campaignsRes.data ?? []) {
    results.push({
      type: "campaign",
      typeLabel: TYPE_LABELS.campaign,
      id: row.id,
      title: row.name,
      subtitle: null,
      href: `/campaigns/${row.id}`,
    });
  }

  return results;
}

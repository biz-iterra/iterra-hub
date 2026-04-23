/**
 * Lead → Opportunity 昇格ロジックのヘルパー関数群
 *
 * Phase 9e: 事業者種別ごとの URL 転記先分岐・担当者/企業情報転記・corporate_number 重複ブロック
 */

// ---------- 型定義 ----------

export type LeadRow = {
  id: string;
  lead_name: string;
  company_name: string | null;
  company_name_kana: string | null;
  representative_name: string | null;
  corporate_number: string | null;
  company_phone: string | null;
  url: string | null;
  contact_last_name: string | null;
  contact_middle_name: string | null;
  contact_first_name: string | null;
  contact_last_name_kana: string | null;
  contact_middle_name_kana: string | null;
  contact_first_name_kana: string | null;
  contact_department: string | null;
  contact_job_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  lead_source_id: string | null;
  owner_user_id: string;
  account_type_id: string | null;
  // relations
  account_type?: { id: string; name: string; slug: string } | null | Array<{ id: string; name: string; slug: string }>;
  stage?: { id: string; auto_promote_to_deal: boolean } | null | Array<{ id: string; auto_promote_to_deal: boolean }>;
};

export type CompanyPayload = {
  name: string;
  name_kana: string | null;
  representative_name: string | null;
  corporate_number: string | null;
  phone: string | null;
  website_url: string | null;
  lead_source_id: string | null;
  owner_user_id: string;
  company_status_id: string;
  created_by: string;
  last_updated_by: string;
};

export type ContactPayload = {
  last_name: string;
  middle_name: string | null;
  first_name: string | null;
  last_name_kana: string | null;
  middle_name_kana: string | null;
  first_name_kana: string | null;
  department: string | null;
  job_title: string | null;
  contact_type: "corporate_rep" | "individual";
  company_id: string | null;
  website_url: string | null;
  contact_status_id: string;
  lead_source_id: string | null;
  owner_user_id: string;
  created_by: string;
  last_updated_by: string;
};

// ---------- 定数 ----------

export const COMPANY_STATUS_ACTIVE = "c1000000-0000-0000-0000-000000000001";
export const CONTACT_STATUS_ACTIVE = "d0000000-0000-0000-0000-000000000001";
export const ACCOUNT_STATUS_PROSPECT = "c0000000-0000-0000-0000-000000000004";

// ---------- ヘルパー関数 ----------

/**
 * lead_name をスペース区切りで姓・名に分割する
 * 1単語の場合: lastName = lead_name, firstName = null（contacts.first_name は nullable）
 */
export function splitLeadName(leadName: string): { lastName: string; firstName: string | null } {
  const parts = leadName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { lastName: parts[0], firstName: null };
  }
  return { lastName: parts[0], firstName: parts.slice(1).join(" ") };
}

/**
 * 法人昇格用 Company 作成 payload を構築する
 * - name:             leads.company_name（なければ lead_name）
 * - name_kana:        leads.company_name_kana
 * - representative_name: leads.representative_name
 * - corporate_number: leads.corporate_number
 * - phone:            leads.company_phone
 * - website_url:      leads.url（法人は companies に転記）
 */
export function buildCompanyPayloadFromLead(
  lead: LeadRow,
  userId: string
): CompanyPayload {
  return {
    name: lead.company_name ?? lead.lead_name,
    name_kana: lead.company_name_kana ?? null,
    representative_name: lead.representative_name ?? null,
    corporate_number: lead.corporate_number ?? null,
    phone: lead.company_phone ?? null,
    website_url: lead.url ?? null,
    lead_source_id: lead.lead_source_id ?? null,
    owner_user_id: lead.owner_user_id,
    company_status_id: COMPANY_STATUS_ACTIVE,
    created_by: userId,
    last_updated_by: userId,
  };
}

/**
 * Contact 作成 payload を構築する
 *
 * - 法人（isCorporate=true）:
 *   - contact_type = 'corporate_rep'
 *   - company_id   = 作成済み company の ID
 *   - website_url  = null（法人は companies.website_url に転記済み）
 * - 個人（isCorporate=false）:
 *   - contact_type = 'individual'
 *   - company_id   = null
 *   - website_url  = leads.url（個人は contacts.website_url に転記）
 *
 * 担当者姓（contact_last_name）が空の場合は lead_name から分割してフォールバック。
 */
export function buildContactPayloadFromLead(
  lead: LeadRow,
  opts: { contactType: "corporate_rep" | "individual"; companyId: string | null },
  userId: string
): ContactPayload {
  // 担当者情報が未入力の場合は lead_name からフォールバック
  let lastName: string;
  let firstName: string | null;

  if (lead.contact_last_name) {
    lastName = lead.contact_last_name;
    firstName = lead.contact_first_name ?? null;
  } else {
    const split = splitLeadName(lead.lead_name);
    lastName = split.lastName;
    firstName = split.firstName;
  }

  return {
    last_name: lastName,
    middle_name: lead.contact_middle_name ?? null,
    first_name: firstName,
    last_name_kana: lead.contact_last_name_kana ?? null,
    middle_name_kana: lead.contact_middle_name_kana ?? null,
    first_name_kana: lead.contact_first_name_kana ?? null,
    department: lead.contact_department ?? null,
    job_title: lead.contact_job_title ?? null,
    contact_type: opts.contactType,
    company_id: opts.companyId,
    // 法人は website_url = null（companies 側に転記済み）
    // 個人は website_url = leads.url
    website_url: opts.contactType === "individual" ? (lead.url ?? null) : null,
    contact_status_id: CONTACT_STATUS_ACTIVE,
    lead_source_id: lead.lead_source_id ?? null,
    owner_user_id: lead.owner_user_id,
    created_by: userId,
    last_updated_by: userId,
  };
}

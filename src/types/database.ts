import type {
  CrmUserRole,
  ContactType,
  ContractMethod,
  CounterpartyType,
  EmailLabel,
  PhoneLabel,
  BankAccountType,
  CareerType,
  AccountContactRole,
  DealActivityType,
  ActivityLogType,
} from "./enums";

// === 共通フィールド ===

type Timestamps = {
  created_at: string;
  updated_at: string;
};

type SoftDeletable = {
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
};

// === マスタ型 ===

export type PipelineType = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type DealStage = {
  id: string;
  pipeline_type_id: string;
  name: string;
  current_situation: string | null;
  required_action: string | null;
  customer_situation: string | null;
  transition_condition: string | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type DealStatus = {
  id: string;
  name: string;
  pipeline_type_id: string;
  deal_stage_id: string | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type ContractType = {
  id: string;
  name: string;
} & SoftDeletable &
  Timestamps;

export type CorporateType = {
  id: string;
  name: string;
} & SoftDeletable &
  Timestamps;

export type Service = {
  id: string;
  name: string;
  description: string | null;
} & SoftDeletable &
  Timestamps;

export type LeadSource = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
} & SoftDeletable &
  Timestamps;

export type AccountType = {
  id: string;
  name: string;
  slug: string | null;
} & SoftDeletable &
  Timestamps;

export type AccountStatus = {
  id: string;
  name: string;
} & SoftDeletable &
  Timestamps;

export type ContactStatus = {
  id: string;
  name: string;
} & SoftDeletable &
  Timestamps;

export type CompanyStatus = {
  id: string;
  name: string;
} & SoftDeletable &
  Timestamps;

export type SkillCategory = {
  id: string;
  name: string;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type Skill = {
  id: string;
  skill_category_id: string;
  name: string;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

// === エンティティ型 ===

export type CrmUser = {
  id: string;
  email: string;
  full_name: string;
  full_name_kana: string | null;
  role: CrmUserRole;
  avatar_url: string | null;
  is_active: boolean;
} & Timestamps;

export type Company = {
  id: string;
  company_code: string;
  corporate_type_id: string | null;
  name: string;
  name_kana: string | null;
  representative_name: string | null;
  corporate_number: string | null;
  invoice_registered: boolean;
  invoice_registration_number: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  phone: string | null;
  fax: string | null;
  website_url: string | null;
  industry_classification_id: string | null;
  registration_certificate_url: string | null;
  internal_memo: string | null;
  lead_source_id: string | null;
  owner_user_id: string | null;
  primary_contact_id: string | null;
  company_status_id: string;
  status_updated_at: string | null;
} & SoftDeletable &
  Timestamps;

export type Account = {
  id: string;
  account_code: string;
  company_id: string | null;
  account_type_id: string | null;
  account_status_id: string;
  name: string;
  description: string | null;
  lead_source_id: string | null;
  owner_user_id: string | null;
  status_updated_at: string | null;
} & SoftDeletable &
  Timestamps;

export type Contact = {
  id: string;
  contact_code: string;
  last_name: string;
  middle_name: string | null;
  first_name: string;
  last_name_kana: string | null;
  middle_name_kana: string | null;
  first_name_kana: string | null;
  contact_status_id: string;
  contact_type: ContactType | null;
  company_id: string | null;
  invoice_registered: boolean;
  invoice_registration_number: string | null;
  postal_code: string | null;
  prefecture: string | null;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  department: string | null;
  job_title: string | null;
  birth_date: string | null;
  blood_type: "A" | "B" | "AB" | "O" | null;
  potential_number: number | null;
  constellation_id: string | null;
  lead_source_id: string | null;
  line_user_id: string | null;
  website_url: string | null;
  internal_memo: string | null;
  owner_user_id: string | null;
  status_updated_at: string | null;
} & SoftDeletable &
  Timestamps;

export type Deal = {
  id: string;
  deal_code: string;
  name: string;
  pipeline_type_id: string;
  deal_stage_id: string;
  deal_status_id: string;
  amount: number | null;
  account_id: string;
  owner_user_id: string | null;
  contract_name: string | null;
  application_date: string | null;
  review_completed_date: string | null;
  stage_updated_at: string | null;
  closed_at: string | null;
  last_updated_by: string | null;
} & SoftDeletable &
  Timestamps;

export type Contract = {
  id: string;
  contract_code: string;
  deal_id: string;
  contract_method: ContractMethod | null;
  contract_type_id: string | null;
  contract_name: string | null;
  counterparty_type: CounterpartyType | null;
  counterparty_company_id: string | null;
  counterparty_contact_id: string | null;
  counterparty_manager_id: string | null;
  contract_content: string | null;
  sent_date: string | null;
  signback_date: string | null;
  execution_date: string | null;
  start_date: string | null;
  end_date: string | null;
  auto_renewal: boolean;
  cancellation_date: string | null;
  original_document_url: string | null;
  contract_url: string | null;
  registered_by: string | null;
} & SoftDeletable &
  Timestamps;

export type Talent = {
  id: string;
  contact_id: string;
  personality_memo: string | null;
  custom_strengths: string | null;
  custom_weaknesses: string | null;
  aptitude_notes: string | null;
  overall_assessment: string | null;
} & SoftDeletable &
  Timestamps;

// === 従属エンティティ ===

export type ContactEmail = {
  id: string;
  contact_id: string;
  email: string;
  label: EmailLabel;
  is_primary: boolean;
  created_at: string;
};

export type ContactPhone = {
  id: string;
  contact_id: string;
  phone: string;
  label: PhoneLabel;
  is_primary: boolean;
  created_at: string;
};

export type FinancialInfo = {
  id: string;
  company_id: string | null;
  contact_id: string | null;
  bank_name: string;
  bank_code: string | null;
  branch_name: string | null;
  branch_code: string | null;
  account_type: BankAccountType | null;
  account_number: string | null;
  account_holder: string | null;
  account_holder_kana: string | null;
  passbook_copy_url: string | null;
  is_primary: boolean;
} & SoftDeletable &
  Timestamps;

export type TalentSkill = {
  id: string;
  talent_id: string;
  skill_id: string;
  proficiency_level: number;
  years_experience: number | null;
  note: string | null;
} & Timestamps;

export type TalentCareer = {
  id: string;
  talent_id: string;
  career_type: CareerType;
  organization: string;
  title: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  sort_order: number;
} & Timestamps;

// === 中間テーブル ===

export type AccountContact = {
  id: string;
  account_id: string;
  contact_id: string;
  role: AccountContactRole | null;
  created_at: string;
};

export type DealService = {
  id: string;
  deal_id: string;
  service_id: string;
  created_at: string;
};

export type LeadLargeSegment = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type LeadSmallSegment = {
  id: string;
  large_segment_id: string;
  code: string;
  name: string;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type LeadCallStatus = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

// === Lead / Campaign マスタ型 ===

export type LeadCategory = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type LeadActivityType = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type LeadStage = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  is_terminal: boolean;
  auto_promote_to_deal: boolean;
} & SoftDeletable &
  Timestamps;

export type LeadStatus = {
  id: string;
  stage_id: string;
  code: string;
  name: string;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type LeadTemperature = {
  id: string;
  code: string;
  name: string;
  color: string | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type LeadScoreThreshold = {
  id: string;
  temperature_id: string;
  min_score: number;
  max_score: number | null;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

// M24
export type LeadCompanySize = {
  id: string;
  code: string;
  name: string;
  min_employees: number | null;
  max_employees: number | null;
  min_capital: number | null;
  max_capital: number | null;
  sort_order: number;
  deleted_at: string | null;
  deleted_by: string | null;
} & Timestamps;

// M25
export type LeadCustomerActivityType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  deleted_at: string | null;
  deleted_by: string | null;
} & Timestamps;

// M26
export type LeadScoreRuleCategory = "attribute" | "interest" | "stage" | "status" | "activity";
export type LeadScoreRuleConditionType =
  | "company_size"
  | "large_segment"
  | "small_segment"
  | "lead_source"
  | "stage"
  | "status"
  | "call_status"
  | "activity_type"
  | "customer_activity_type";

export type LeadScoreRule = {
  id: string;
  category: LeadScoreRuleCategory;
  condition_type: LeadScoreRuleConditionType;
  condition_value_id: string | null;
  condition_value_text: string | null;
  score_delta: number;
  description: string | null;
  sort_order: number;
  deleted_at: string | null;
  deleted_by: string | null;
} & Timestamps;

export type Campaign = {
  id: string;
  name: string;
  type: "generation" | "nurturing" | "qualification";
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "active" | "paused" | "completed" | "cancelled";
} & SoftDeletable &
  Timestamps;

// === Lead トランザクション型 ===

export type Lead = {
  id: string;
  lead_name: string;
  account_type_id: string | null;
  company_name: string | null;
  company_id: string | null;
  contact_id: string | null;
  lead_source_id: string | null;
  stage_id: string;
  status_id: string | null;
  temperature_id: string | null;
  score: number | null;
  url: string | null;
  company_phone: string | null;
  contact_phone: string | null;
  contact_last_name: string | null;
  contact_middle_name: string | null;
  contact_first_name: string | null;
  contact_last_name_kana: string | null;
  contact_middle_name_kana: string | null;
  contact_first_name_kana: string | null;
  contact_department: string | null;
  contact_job_title: string | null;
  contact_email: string | null;
  company_name_kana: string | null;
  representative_name: string | null;
  corporate_number: string | null;
  large_segment_id: string | null;
  small_segment_id: string | null;
  category_id: string | null;
  /** 従業員数（判定用。スコア算出では company_size_id 経由で参照） */
  employee_count: number | null;
  /** 資本金（円、判定用） */
  capital: number | null;
  /** 企業規模（lead_company_sizes FK）。DBトリガで自動判定。手動設定不可 */
  company_size_id: string | null;
  owner_user_id: string;
  promoted_deal_id: string | null;
  promoted_company_id: string | null;
  promoted_contact_id: string | null;
  promoted_account_id: string | null;
  created_by: string | null;
  last_updated_by: string | null;
  /** 副担当（lead_owners 中間テーブル JOIN 結果）。SELECT 時のみ付与 */
  sub_owners?: LeadOwner[];
} & SoftDeletable &
  Timestamps;

// === Lead 中間・従属テーブル型 ===

// T10: リード副担当中間テーブル（Phase 10b-1）
export type LeadOwner = {
  lead_id: string;
  user_id: string;
  assigned_at: string;
  user?: { id: string; full_name: string };
};

export type LeadCampaign = {
  lead_id: string;
  campaign_id: string;
  assigned_at: string;
};

export type LeadActivity = {
  id: string;
  lead_id: string;
  call_number: number;
  called_on: string;
  called_at_time: string | null;
  call_status_id: string;
  caller_user_id: string;
  note: string | null;
  activity_type_id: string | null;
  created_at: string;
  /** JOIN: crm_users */
  caller?: { id: string; full_name: string };
};

// D09
export type LeadCustomerActivity = {
  id: string;
  lead_id: string;
  activity_type_id: string;
  occurred_at: string;
  detail: string | null;
  source: string | null;
  created_by: string | null;
  last_updated_by: string | null;
  /** JOIN: lead_customer_activity_types */
  activity_type?: LeadCustomerActivityType;
} & Timestamps;

// D10
export type LeadScoreBreakdown = {
  id: string;
  lead_id: string;
  rule_id: string;
  score_delta: number;
  applied_at: string;
  /** JOIN: lead_score_rules */
  rule?: LeadScoreRule;
};

// === ビュー型 ===

export type VLeadWithCategory = Lead & {
  stage_slug: string;
  stage_name: string;
  is_terminal: boolean;
  auto_promote_to_deal: boolean;
  status_code: string | null;
  status_name: string | null;
  temperature_code: string | null;
  temperature_name: string | null;
  temperature_color: string | null;
  category_code: string | null;
  category_name: string | null;
  category_color: string | null;
};

// === アクティビティ / ログ ===

export type DealActivity = {
  id: string;
  deal_id: string;
  activity_type: DealActivityType;
  activity_at: string;
  contact_id: string | null;
  subject: string | null;
  description: string | null;
  duration_minutes: number | null;
  performed_by: string;
} & Timestamps;

export type DealActivityEmail = {
  id: string;
  deal_activity_id: string;
  sender_name: string | null;
  sender_email: string | null;
  recipient_email: string | null;
  body: string | null;
  summary: string | null;
  created_at: string;
};

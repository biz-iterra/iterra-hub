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
  description: string | null;
} & SoftDeletable &
  Timestamps;

export type AccountType = {
  id: string;
  name: string;
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
  potential_number: number | null;
  constellation_id: string | null;
  lead_source_id: string | null;
  line_user_id: string | null;
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

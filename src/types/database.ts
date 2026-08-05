import type { Database } from "./database.generated";

// NOTE: テーブル行型は supabase gen types の生成物から導出する（`npm run db:types` で更新）。
// 手書きしないこと。スキーマとの乖離をビルドで検出するための措置。

// enums の多くはテーブル行型を生成型から導出したことで不要になった。
// 生成型に含まれない箇所（deal_activities 等）で使う分だけを残す。
import type { DealActivityType } from "./enums";

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

export type PipelineType = Database["public"]["Tables"]["pipeline_types"]["Row"];

export type DealStage = Database["public"]["Tables"]["deal_stages"]["Row"];

export type DealStatus = Database["public"]["Tables"]["deal_statuses"]["Row"];

export type ContractType = Database["public"]["Tables"]["contract_types"]["Row"];

export type CorporateType = Database["public"]["Tables"]["corporate_types"]["Row"];

export type Service = Database["public"]["Tables"]["services"]["Row"];

export type LeadSource = Database["public"]["Tables"]["lead_sources"]["Row"];

export type AccountType = Database["public"]["Tables"]["account_types"]["Row"];

export type AccountStatus = Database["public"]["Tables"]["account_statuses"]["Row"];

export type ContactStatus = Database["public"]["Tables"]["contact_statuses"]["Row"];

export type CompanyStatus = Database["public"]["Tables"]["company_statuses"]["Row"];

export type SkillCategory = Database["public"]["Tables"]["skill_categories"]["Row"];

export type Skill = Database["public"]["Tables"]["skills"]["Row"];

// === エンティティ型 ===

export type CrmUser = Database["public"]["Tables"]["crm_users"]["Row"];

export type Company = Database["public"]["Tables"]["companies"]["Row"];

export type Account = Database["public"]["Tables"]["accounts"]["Row"];

export type Contact = Database["public"]["Tables"]["contacts"]["Row"];

export type Deal = Database["public"]["Tables"]["deals"]["Row"];

export type Contract = Database["public"]["Tables"]["contracts"]["Row"];

export type Talent = Database["public"]["Tables"]["talents"]["Row"];

// === 従属エンティティ ===

export type ContactEmail = Database["public"]["Tables"]["contact_emails"]["Row"];

export type ContactPhone = Database["public"]["Tables"]["contact_phones"]["Row"];

export type FinancialInfo = Database["public"]["Tables"]["financial_info"]["Row"];

export type TalentSkill = Database["public"]["Tables"]["talent_skills"]["Row"];

export type TalentCareer = Database["public"]["Tables"]["talent_careers"]["Row"];

// === 中間テーブル ===

export type AccountContact = Database["public"]["Tables"]["account_contacts"]["Row"];

export type DealService = Database["public"]["Tables"]["deal_services"]["Row"];

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
  /** 自動採番になったため NULL を許す（20260805000019）。判定には使わない */
  code: string | null;
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
  /** 自動採番になったため NULL を許す（20260805000019）。判定には使わない */
  code: string | null;
  name: string;
  sort_order: number;
} & SoftDeletable &
  Timestamps;

export type LeadTemperature = {
  id: string;
  /** 自動採番になったため NULL を許す（20260805000019）。判定には使わない */
  code: string | null;
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

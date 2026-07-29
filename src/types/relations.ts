/**
 * JOIN を含む Server Action の戻り値型。
 *
 * 各 Action の `*_SELECT` 定数に対応する型をここに集約する。
 * `ActionResult<any>` を置き換え、呼び出し側（画面）でも同じ型を使うことで
 * 存在しないプロパティへのアクセスをビルド時に検出する。
 *
 * SELECT を変更したら、対応する型もここで直すこと。
 */

import type { Database } from "./database.generated";

type Tables = Database["public"]["Tables"];

/** テーブルの行型を短く書くためのヘルパー。例: Row<"deals"> */
export type Row<K extends keyof Tables> = Tables[K]["Row"];

/** リレーション先から一部の列だけを取る場合の短縮形 */
type Ref<K extends keyof Tables, F extends keyof Row<K>> = Pick<Row<K>, F>;

// ============================================================
// マスタ参照（多くの画面で共通して使う形）
// ============================================================

export type NamedRef = { id: string; name: string };
export type SortedRef = { id: string; name: string; sort_order: number };
export type UserRef = { id: string; full_name: string };

// ============================================================
// Deal
// ============================================================

/** deals.ts の DEAL_SELECT に対応 */
export type DealWithRelations = Row<"deals"> & {
  pipeline_type: NamedRef | null;
  deal_stage: SortedRef | null;
  deal_status: SortedRef | null;
  account:
    | (Ref<"accounts", "id" | "account_code" | "name"> & {
        company: NamedRef | null;
      })
    | null;
  owner: UserRef | null;
  deal_services: { service: NamedRef | null }[];
};

/** deals.ts の getDeal に対応（DEAL_SELECT + 契約・対応履歴・プロジェクト） */
export type DealDetail = DealWithRelations & {
  contracts: Ref<
    "contracts",
    | "id"
    | "contract_code"
    | "contract_name"
    | "contract_method"
    | "start_date"
    | "end_date"
    | "deleted_at"
  >[];
  deal_activities: (Ref<
    "deal_activities",
    "id" | "activity_type" | "activity_at" | "subject" | "performed_by"
  > & {
    crm_users: { full_name: string } | null;
  })[];
  deal_projects: {
    id: string;
    project:
      | (Ref<"projects", "id" | "project_code" | "name" | "deleted_at"> & {
          project_status: NamedRef | null;
        })
      | null;
  }[];
};

// ============================================================
// Contact
// ============================================================

export type ContactWithRelations = Row<"contacts"> & {
  contact_status: NamedRef | null;
  company: NamedRef | null;
  owner: UserRef | null;
};

// ============================================================
// Company
// ============================================================

/**
 * companies.ts の getCompanies に対応。
 * エイリアスを付けていない JOIN はテーブル名がそのままキーになる。
 */
export type CompanyWithRelations = Row<"companies"> & {
  corporate_types: NamedRef | null;
  lead_sources: { name: string } | null;
  company_status: NamedRef | null;
  crm_users: UserRef | null;
};

/** companies.ts の getCompany に対応（業種・主担当・紐づくアカウント/コンタクト） */
export type CompanyDetail = Row<"companies"> & {
  corporate_types: NamedRef | null;
  lead_sources: NamedRef | null;
  company_status: NamedRef | null;
  industry_classifications: Ref<
    "industry_classifications",
    "id" | "major_name" | "middle_name" | "minor_name"
  > | null;
  crm_users: UserRef | null;
  primary_contact: Ref<
    "contacts",
    "id" | "contact_code" | "last_name" | "first_name"
  > | null;
  accounts: Ref<"accounts", "id" | "account_code" | "name" | "deleted_at">[];
  contacts: Ref<
    "contacts",
    | "id"
    | "contact_code"
    | "last_name"
    | "first_name"
    | "department"
    | "job_title"
    | "deleted_at"
  >[];
};

// ============================================================
// Account
// ============================================================

export type AccountWithRelations = Row<"accounts"> & {
  account_type: NamedRef | null;
  account_status: NamedRef | null;
  company: NamedRef | null;
  owner: UserRef | null;
};

// ============================================================
// Contract
// ============================================================

/** 姓名だけを持つコンタクト参照（画面で氏名を組み立てる用途） */
type ContactNameRef = Ref<"contacts", "id" | "last_name" | "first_name">;

/** contracts.ts の CONTRACT_LIST_SELECT に対応 */
export type ContractWithRelations = Row<"contracts"> & {
  deal: Ref<"deals", "id" | "deal_code" | "name"> | null;
  contract_type: NamedRef | null;
  counterparty_company: NamedRef | null;
  counterparty_contact: ContactNameRef | null;
  registered_user: UserRef | null;
};

/** contracts.ts の getContract に対応（一覧 + 相手先担当者） */
export type ContractDetail = ContractWithRelations & {
  counterparty_manager:
    | (ContactNameRef & Ref<"contacts", "department" | "job_title">)
    | null;
};

// ============================================================
// Project
// ============================================================

/** projects.ts の getProjects に対応 */
export type ProjectWithRelations = Row<"projects"> & {
  project_status: NamedRef | null;
  owner: UserRef | null;
};

/** projects.ts の getProject に対応（メンバー・紐づくディールを含む） */
export type ProjectDetail = Row<"projects"> & {
  project_status: SortedRef | null;
  owner: UserRef | null;
  project_members: {
    id: string;
    user_id: string;
    created_at: string;
    user: (UserRef & Ref<"crm_users", "email" | "role">) | null;
  }[];
  deal_projects: {
    id: string;
    deal_id: string;
    created_at: string;
    deal:
      | (Ref<"deals", "id" | "deal_code" | "name" | "amount" | "closed_at"> & {
          account: Ref<"accounts", "id" | "name" | "account_code"> | null;
          pipeline_type: NamedRef | null;
          deal_stage: SortedRef | null;
          deal_status: SortedRef | null;
        })
      | null;
  }[];
};

// ============================================================
// Lead
// ============================================================

export type LeadWithRelations = Row<"leads"> & {
  stage: SortedRef | null;
  status: NamedRef | null;
  temperature: NamedRef | null;
  category: NamedRef | null;
  owner: UserRef | null;
};

// ============================================================
// Campaign
// ============================================================

export type CampaignWithRelations = Row<"campaigns"> & {
  owner: UserRef | null;
};

// ============================================================
// Talent
// ============================================================

/** タレントに紐づくコンタクトの基本情報（一覧・詳細で共通） */
type TalentContactRef = Ref<
  "contacts",
  "id" | "contact_code" | "last_name" | "first_name" | "department" | "job_title"
>;

/** talent_skills + skill（skills はカテゴリ名も含む） */
export type TalentSkillWithSkill = Ref<
  "talent_skills",
  "id" | "proficiency_level" | "years_experience"
> & {
  skill:
    | (Ref<"skills", "id" | "skill_code" | "axis" | "name" | "system_tags"> & {
        skill_categories: { name: string } | null;
      })
    | null;
};

/** talents.ts の TALENT_LIST_SELECT に対応 */
export type TalentWithRelations = Row<"talents"> & {
  contact: TalentContactRef | null;
  talent_skills: TalentSkillWithSkill[];
};

/** talents.ts の getTalent に対応（診断結果・スキル備考・経歴を含む） */
export type TalentDetail = Row<"talents"> & {
  contact:
    | (TalentContactRef & {
        number_diagnosis: Row<"number_diagnosis"> | null;
        constellation_fortune_telling: Row<"constellation_fortune_telling"> | null;
      })
    | null;
  talent_skills: (TalentSkillWithSkill & Ref<"talent_skills", "note">)[];
  talent_careers: TalentCareerRow[];
};

/**
 * talent_careers.career_type は DB の CHECK 制約で 3 値に限定されている
 * （20260416040010_create_talents.sql）。生成型では TEXT のままなので
 * 画面側で分岐できるよう、ここで絞り込んだ型を提供する。
 */
export type TalentCareerType = "work" | "education" | "certification";

export type TalentCareerRow = Omit<Row<"talent_careers">, "career_type"> & {
  career_type: TalentCareerType;
};

// ============================================================
// 対応履歴（Deal / Lead）
// ============================================================

/** コード・色を持つマスタ参照（アクティビティ種別・通電状況など） */
export type CodedRef = { id: string; code: string; name: string; color: string | null };

/** activities.ts の getDealActivities に対応 */
export type DealActivityWithRelations = Row<"deal_activities"> & {
  contact: ContactNameRef | null;
  performer: UserRef | null;
  // deal_activity_emails は 1 対 1（deal_id に unique 制約）なので配列ではない
  deal_activity_emails: Row<"deal_activity_emails"> | null;
};

/** lead-activities.ts の ACTIVITY_SELECT に対応 */
export type LeadActivityWithRelations = Row<"lead_activities"> & {
  call_status: CodedRef | null;
  caller: UserRef | null;
  activity_type: CodedRef | null;
};

// ============================================================
// 一覧取得の共通戻り値（Pagination 規約に対応）
// ============================================================

export type Paged<T> = { rows: T[]; total: number };

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
type Views = Database["public"]["Views"];

/** テーブルの行型を短く書くためのヘルパー。例: Row<"deals"> */
export type Row<K extends keyof Tables> = Tables[K]["Row"];

/** View の行型。例: ViewRow<"v_leads_with_category"> */
export type ViewRow<K extends keyof Views> = Views[K]["Row"];

/** リレーション先から一部の列だけを取る場合の短縮形 */
type Ref<K extends keyof Tables, F extends keyof Row<K>> = Pick<Row<K>, F>;

// ============================================================
// マスタ参照（多くの画面で共通して使う形）
// ============================================================

export type NamedRef = { id: string; name: string };
export type SortedRef = { id: string; name: string; sort_order: number };
export type UserRef = { id: string; full_name: string };

/**
 * バッジ色をマスタに持つ参照（ステータス／ステージ系）。
 * 色は DB の値をそのまま使う。画面ごとに算出すると同じ値が別の色になるため、
 * バッジを出す箇所は必ず color まで取得すること。
 */
export type ColoredRef = NamedRef & { color: string | null };
export type SortedColoredRef = SortedRef & { color: string | null };

// ============================================================
// Deal
// ============================================================

/** deals.ts の DEAL_SELECT に対応 */
export type DealWithRelations = Row<"deals"> & {
  pipeline_type: NamedRef | null;
  deal_stage: SortedColoredRef | null;
  deal_status: SortedColoredRef | null;
  /** 取引先は契約成立時に作られるため、契約前の商談では null */
  account:
    | (Ref<"accounts", "id" | "account_code" | "name"> & {
        company: NamedRef | null;
      })
    | null;
  /** 取引先が未作成の間の相手先 */
  company: NamedRef | null;
  contact: Ref<"contacts", "id" | "last_name" | "first_name"> | null;
  owner: UserRef | null;
  deal_services: { service: NamedRef | null }[];
};

/** deals.ts の getDeal に対応（DEAL_SELECT + 契約・アクティビティ・プロジェクト） */
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
          project_status: ColoredRef | null;
        })
      | null;
  }[];
};

// ============================================================
// Contact
// ============================================================

/** contact_emails / contact_phones の一覧表示に使う列 */
type ContactEmailRef = Ref<"contact_emails", "id" | "email" | "label" | "is_primary">;
type ContactPhoneRef = Ref<"contact_phones", "id" | "phone" | "label" | "is_primary">;

/** 所属先としてのアカウント参照（account_contacts 経由） */
type AccountContactRef = {
  id: string;
  role: string | null;
  account: Ref<"accounts", "id" | "account_code" | "name"> | null;
};

/** contacts.ts の getContacts に対応 */
export type ContactWithRelations = Row<"contacts"> & {
  contact_status: ColoredRef | null;
  company: NamedRef | null;
  owner: UserRef | null;
  contact_emails: ContactEmailRef[];
  contact_phones: ContactPhoneRef[];
  /**
   * 所属取引先。法人所属コンタクトは company_id、個人コンタクトはこの経路が
   * 所属の出所になるため、一覧でも両方を取得して 1 列に統合表示する。
   */
  account_contacts: AccountContactRef[];
};

/**
 * 名刺 1 枚（business_cards）。
 *
 * 所属（会社・部署・役職）は名刺の属性として持ち、その名刺のメール・電話に紐づく。
 * `source_registered_on` は**取込元にデータを登録した日**で、在籍期間でも
 * 名刺を交換した日でもない（docs/contact-identity.md）。
 */
export type BusinessCardRef = Ref<
  "business_cards",
  | "id"
  | "company_id"
  | "company_name_raw"
  | "department"
  | "job_title"
  | "source"
  | "source_registered_on"
  | "is_primary"
  | "referrer_contact_id"
  | "referral_memo"
> & {
  company: NamedRef | null;
  contact_email: Ref<"contact_emails", "id" | "email"> | null;
  contact_phone: Ref<"contact_phones", "id" | "phone"> | null;
  /** 紹介者。連絡先に無い紹介者は referral_memo だけが入る */
  referrer: Ref<"contacts", "id" | "last_name" | "first_name"> | null;
};

/** 名刺一覧の 1 行（business-cards.ts の getBusinessCards に対応） */
export type BusinessCardListRow = Ref<
  "business_cards",
  | "id"
  | "company_name_raw"
  | "department"
  | "job_title"
  | "source"
  | "source_registered_on"
  | "is_primary"
  | "referral_memo"
> & {
  contact: Ref<"contacts", "id" | "last_name" | "first_name"> | null;
  company: NamedRef | null;
  referrer: Ref<"contacts", "id" | "last_name" | "first_name"> | null;
};

/**
 * ある連絡先が紹介した相手（business-cards.ts の getReferredContacts に対応）。
 * 紹介は名刺に紐づくので、同じ人を別の場面で紹介していれば複数行になる。
 */
export type ReferredCardRow = Ref<
  "business_cards",
  "id" | "company_name_raw" | "referral_memo" | "source_registered_on"
> & {
  contact: Ref<"contacts", "id" | "last_name" | "first_name"> | null;
  company: NamedRef | null;
};

/**
 * 住所の紐付け 1 件（entity_addresses + addresses）。
 * 連絡先・事業者情報・取引先のいずれからも同じ形で扱う。
 */
export type EntityAddress = Ref<
  "entity_addresses",
  "id" | "label" | "is_primary" | "phone" | "fax" | "memo"
> & {
  address: Ref<
    "addresses",
    "id" | "postal_code" | "prefecture" | "city" | "address_line1" | "address_line2" | "raw_text"
  > | null;
};

/** 統合候補の判断材料として見せる連絡先の情報 */
export type ContactMergeSide = Ref<
  "contacts",
  | "id"
  | "contact_code"
  | "last_name"
  | "first_name"
  | "last_name_kana"
  | "first_name_kana"
  | "department"
  | "job_title"
  | "created_at"
> & {
  company: NamedRef | null;
};

/** contact-merge.ts の getMergeCandidates に対応 */
export type ContactMergeCandidate = Ref<
  "contact_merge_candidates",
  "id" | "reason" | "detail" | "status" | "created_at"
> & {
  contact: ContactMergeSide | null;
  candidate: ContactMergeSide | null;
};

/**
 * merge_contacts_preview / merge_contacts の戻り値。
 * 統合で付け替わる件数。取り消せない操作なので実行前に必ず見せる。
 */
export type ContactMergePreview = {
  emails: number;
  phones: number;
  cards: number;
  addresses: number;
  accounts: number;
  leads: number;
  deals: number;
  contracts: number;
  talents: number;
  emails_synced: number;
  activities: number;
  histories: number;
  /** タレント情報が両方にあると統合できない（1:1 制約） */
  talent_conflict: boolean;
};

/** contacts.ts の getContact に対応（タレント・診断・所属アカウント・名刺を含む） */
/** 兼務（company_contacts）。主たる所属は contacts.company_id が持つ */
export type CompanyAffiliation = {
  id: string;
  company_id: string;
  job_title: string | null;
  company: NamedRef | null;
};

export type ContactDetail = ContactWithRelations & {
  business_cards: BusinessCardRef[];
  /** **主たる所属は含まない。** ここに入るのは兼務だけ */
  company_contacts: CompanyAffiliation[];
  talent:
    | (Row<"talents"> & {
        talent_skills: (Row<"talent_skills"> & {
          skill: (NamedRef & { skill_categories: { name: string } | null }) | null;
        })[];
        talent_careers: TalentCareerRow[];
      })
    | null;
  number_diagnosis: Row<"number_diagnosis"> | null;
  constellation_fortune_telling: Row<"constellation_fortune_telling"> | null;
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
  company_status: ColoredRef | null;
  crm_users: UserRef | null;
  /**
   * freee の取引先との紐づけ。**admin 以外では常に空**（RLS）なので、
   * 未連携と区別できない。一覧は admin のときだけアイコンを出す
   */
  freee_partners: Ref<"freee_partners", "id" | "link_status">[];
};

/** companies.ts の getCompany に対応（業種・主担当・紐づくアカウント/コンタクト） */
export type CompanyDetail = Row<"companies"> & {
  corporate_types: NamedRef | null;
  lead_sources: NamedRef | null;
  company_status: ColoredRef | null;
  industry_classifications: Ref<
    "industry_classifications",
    "id" | "major_name" | "middle_name" | "minor_name"
  > | null;
  crm_users: UserRef | null;
  /** 実在確認を行った担当者（verified_by） */
  verifier: UserRef | null;
  primary_contact: Ref<
    "contacts",
    "id" | "contact_code" | "last_name" | "first_name"
  > | null;
  /** 代表者の連絡先。これがあれば氏名はこちらから引く */
  representative_contact: Ref<
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
    // 代表者に選べるのは法人代表だけなので種別まで持つ
    | "contact_type"
    | "department"
    | "job_title"
    | "deleted_at"
  >[];
  /**
   * 兼務でこの事業者に関わる連絡先。**主たる所属（contacts）とは別**。
   * 一覧に出すときは両方を合わせる（`company_contact_affiliations` と同じ考え方）
   */
  company_contacts: {
    id: string;
    job_title: string | null;
    contact: Ref<
      "contacts",
      | "id"
      | "contact_code"
      | "last_name"
      | "first_name"
      | "contact_type"
      | "department"
      | "job_title"
      | "deleted_at"
    > | null;
  }[];
  /** 名刺取込の法人名寄せに使うメールドメイン */
  company_domains: Ref<"company_domains", "id" | "domain" | "is_primary">[];
  /**
   * freee の取引先との紐づけ。**admin 以外では常に空**（RLS）なので、
   * 未連携と区別できない。画面は admin のときだけ状態を出すこと
   */
  freee_partners: Ref<"freee_partners", "id" | "link_status" | "freee_partner_id">[];
};

// ============================================================
// Account
// ============================================================

/**
 * 取引先が持つ区分（顧客・仕入れ先など）。
 * 事業体の形態を表す account_type とは軸が違い、1 社が複数持ちうる。
 */
export type AccountRoleRef = {
  id: string;
  /** 契約成立で自動付与されたか。手動付与と区別する */
  assigned_by_contract: boolean;
  role_type: (ColoredRef & Ref<"account_role_types", "code" | "sort_order">) | null;
};

/**
 * accounts.ts の getAccountRoleTypes に対応。
 * pipeline_type は「この区分が契約成立時に自動付与されるパイプライン」。
 */
export type AccountRoleTypeWithPipeline = Row<"account_role_types"> & {
  pipeline_type: NamedRef | null;
};

/** accounts.ts の getAccounts に対応 */
export type AccountWithRelations = Row<"accounts"> & {
  /** インボイス登録番号は事業者情報が正本。取引先では読み取りだけ（20260802000005） */
  company: (NamedRef & Ref<"companies", "invoice_registration_number">) | null;
  /** slug は AccountTypeBadge の色分けに使う */
  account_type: (NamedRef & Ref<"account_types", "slug">) | null;
  account_status: ColoredRef | null;
  owner: UserRef | null;
  account_roles: AccountRoleRef[];
};

/** accounts.ts の getAccount に対応（所属コンタクト・紐づくディールを含む） */
export type AccountDetail = AccountWithRelations & {
  lead_source: NamedRef | null;
  contacts: {
    id: string;
    role: string | null;
    contact:
      | (Ref<
          "contacts",
          | "id"
          | "contact_code"
          | "last_name"
          | "first_name"
          | "department"
          | "job_title"
          | "deleted_at"
        > & { company: NamedRef | null })
      | null;
  }[];
  deals: (Ref<"deals", "id" | "deal_code" | "name" | "amount"> & {
    deal_stage: { name: string } | null;
    deal_status: { name: string } | null;
  })[];
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
  project_status: SortedColoredRef | null;
  owner: UserRef | null;
};

/** projects.ts の getProject に対応（メンバー・紐づくディールを含む） */
export type ProjectDetail = Row<"projects"> & {
  project_status: SortedColoredRef | null;
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
      | (Ref<
          "deals",
          "id" | "deal_code" | "name" | "amount" | "closed_at" | "deleted_at"
        > & {
          account: Ref<"accounts", "id" | "name" | "account_code"> | null;
          pipeline_type: NamedRef | null;
          deal_stage: SortedColoredRef | null;
          deal_status: SortedColoredRef | null;
        })
      | null;
  }[];
};

// ============================================================
// Lead
// ============================================================

/** code は自動採番になったため NULL を許す（20260805000019）。判定に使わない */
export type CodeNameRef = { id: string; code: string | null; name: string };

/** 一覧・詳細の双方で JOIN しているマスタ群（LEAD_SELECT と共通） */
type LeadCommonRelations = {
  stage:
    | (SortedColoredRef &
        Ref<"lead_stages", "slug" | "is_terminal" | "auto_promote_to_deal">)
    | null;
  status: (SortedColoredRef & Ref<"lead_statuses", "code">) | null;
  category: CodedRef | null;
  temperature: CodedRef | null;
  account_type: (NamedRef & Ref<"account_types", "slug">) | null;
  large_segment: CodeNameRef | null;
  small_segment: CodeNameRef | null;
  owner: UserRef | null;
};

/**
 * leads.ts の getLeads に対応。
 * 取得元は v_leads_with_category View（deleted_at フィルタは View 内で実施）。
 */
export type LeadListRow = Omit<ViewRow<"v_leads_with_category">, "id"> &
  LeadCommonRelations & {
    /**
     * View の列は生成型では一律 nullable になるが、実体は leads.id（NOT NULL）。
     * 行の同定に使うため non-null として扱う。
     */
    id: string;
    /**
     * lead_activities.called_on の最大値。DB カラムではなく
     * getLeads が取得後に付与する派生値。
     */
    last_activity_at: string | null;
  };

/** leads.ts の LEAD_SELECT に対応 */
export type LeadWithRelations = Row<"leads"> &
  LeadCommonRelations & {
    lead_source: NamedRef | null;
    company_size: CodeNameRef | null;
    score_breakdowns: {
      id: string;
      score_delta: number;
      applied_at: string;
      rule: Ref<
        "lead_score_rules",
        "id" | "category" | "condition_type" | "description"
      > | null;
    }[];
    customer_activities: (Ref<
      "lead_customer_activities",
      "id" | "occurred_at" | "detail" | "source" | "created_at"
    > & {
      activity_type: CodeNameRef | null;
    })[];
    sub_owners: { user_id: string; user: UserRef | null }[];
    /**
     * 取込時に名寄せ／作成した法人・連絡先。
     * 名刺は「リードであると同時に連絡先でもある」ため、昇格を待たずに紐付く。
     */
    linked_company: Ref<"companies", "id" | "company_code" | "name"> | null;
    linked_contact: Ref<
      "contacts",
      "id" | "contact_code" | "last_name" | "first_name"
    > | null;
  };

/**
 * leads.ts の promoteLeadToDeal に対応。
 * DB 関数 promote_lead_to_deal（20260728000001）が返す各エンティティの ID。
 */
export type LeadPromotionResult = {
  deal_id: string;
  company_id: string | null;
  contact_id: string;
  account_id: string;
};

/**
 * leads.ts の getLeadById に対応。
 * lead_campaigns の JOIN 結果は campaign_ids にフラット化して返す。
 */
export type LeadDetail = Omit<LeadWithRelations, "lead_campaigns"> & {
  campaign_ids: string[];
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
  contact:
    | (TalentContactRef &
        Ref<"contacts", "potential_number"> & {
          /** ポテンシャルタイプ（IL+ / PR- など）。一覧の列と絞り込みに使う */
          number_diagnosis: Ref<"number_diagnosis", "number" | "type"> | null;
        })
    | null;
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

/**
 * campaigns.ts の getUnassignedLeadsForCampaign に対応。
 * 紐付け直後の楽観更新で CampaignLeadRow を組み立てられるよう、
 * 一覧表示に必要な列まで取得している。
 */
export type UnassignedLeadRow = Ref<
  "leads",
  | "id"
  | "lead_name"
  | "company_name"
  | "stage_id"
  | "status_id"
  | "score"
  | "temperature_id"
  | "owner_user_id"
> & {
  category: CodedRef | null;
  temperature: CodedRef | null;
};

/** campaigns.ts の getCampaignLeads に対応 */
export type CampaignLeadRow = {
  assigned_at: string;
  lead:
    | (Ref<
        "leads",
        | "id"
        | "lead_name"
        | "company_name"
        | "stage_id"
        | "status_id"
        | "score"
        | "temperature_id"
        | "owner_user_id"
      > & {
        stage: (SortedColoredRef & Ref<"lead_stages", "slug">) | null;
        status: (SortedColoredRef & Ref<"lead_statuses", "code">) | null;
        temperature: CodedRef | null;
        owner: UserRef | null;
      })
    | null;
};

// ============================================================
// アクティビティ（Deal / Lead）
// ============================================================

/** code は自動採番になったため NULL を許す（20260805000019）。判定に使わない */
export type CodedRef = { id: string; code: string | null; name: string; color: string | null };

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

/**
 * leads.ts の createLeadCustomerActivity / updateLeadCustomerActivity に対応
 * （insert/update 後に activity_type を JOIN して返す）。
 */
export type LeadCustomerActivityWithType = Row<"lead_customer_activities"> & {
  activity_type: CodeNameRef | null;
};

/**
 * masters.ts の getLeadScoreRulesWithBrokenRefs に対応。
 * condition_value_id の参照先マスタ行が存在するかを Action 側で判定して付与する。
 */
export type LeadScoreRuleWithRefCheck = Row<"lead_score_rules"> & {
  _refBroken: boolean;
};

/** activities.ts の getActivityLogs に対応 */
export type ActivityLogWithRelations = Row<"activity_logs"> & {
  creator: UserRef | null;
};

// ============================================================
// 一覧取得の共通戻り値（Pagination 規約に対応）
// ============================================================

export type Paged<T> = { rows: T[]; total: number };

// ============================================================
// メール連携（Gmail）
// ============================================================

/** email-sync.ts の getMyGmailConnections に対応。トークンは含めない */
export type GmailConnectionSummary = Ref<
  "gmail_connections",
  | "id"
  | "email_address"
  | "granted_scope"
  | "last_synced_at"
  | "last_error"
  | "is_active"
  | "created_at"
>;

/**
 * Google コンタクト連携の接続。
 * トークン系は返さない（画面で使う必要が無く、漏らす経路を作らないため）。
 */
export type GoogleContactConnectionSummary = Ref<
  "google_contact_connections",
  | "id"
  | "email_address"
  | "hd_domain"
  | "granted_scope"
  | "last_synced_at"
  | "last_error"
  | "is_active"
  | "created_at"
> & {
  /** この接続で同期している連絡先の数 */
  syncedCount: number;
};

/** email-sync.ts の getEmailContactCandidates に対応 */
export type EmailCandidateWithCompany = Row<"email_contact_candidates"> & {
  /** ドメインから引き当てた法人。承認時の所属の初期値になる */
  company: NamedRef | null;
};

/**
 * email-sync.ts の getContactEmailMessages に対応。
 * role は「そのメールでこの連絡先が From / To / Cc のどれだったか」。
 */
export type EmailMessageWithContacts = Ref<
  "email_messages",
  | "id"
  | "gmail_message_id"
  | "gmail_thread_id"
  | "direction"
  | "subject"
  | "sent_at"
  | "from_email"
  | "from_name"
> & { role: string };
// ============================================================
// アクティビティ横断フィード
// ============================================================

/** 記録元。ビューの UNION と 1:1 で対応する */
export type ActivityFeedSourceKind =
  | "lead_activity"
  | "lead_customer_activity"
  | "email";

/**
 * activity_feed ビューの行。
 * ビューは列が NULL 許容として生成されるため、画面で使う形に絞って上書きする
 * （source_kind / occurred_at / entity_type は UNION の各枝でリテラルを置いており必ず入る）。
 */
export type ActivityFeedRow = Omit<
  ViewRow<"activity_feed">,
  "source_kind" | "occurred_at" | "entity_type" | "entity_id" | "id"
> & {
  id: string;
  source_kind: ActivityFeedSourceKind;
  occurred_at: string;
  entity_type: "lead" | "contact";
  entity_id: string;
};

// ============================================================
// freee 会計連携（取引先の突合）
//
// freee 側は読み取り専用。CRM 側の紐付け判断だけをこちらで持つ。
// ============================================================

/** 管理画面に出す接続状態。**トークンは含めない** */
export type FreeeConnectionStatus = {
  /** 環境変数が揃っているか（未設定なら接続ボタン自体を出さない） */
  configured: boolean;
  connection: {
    id: string;
    freeeCompanyId: number;
    freeeCompanyName: string | null;
    lastSyncedAt: string | null;
    /** 全件同期（freee 側の削除検出）を最後に行った日時 */
    lastFullSyncedAt: string | null;
    lastError: string | null;
    connectedAt: string;
  } | null;
};

export type FreeeSyncSummary = {
  fetched: number;
  upserted: number;
  /** インボイス番号一致で自動紐付けした件数 */
  autoLinked: number;
  /** 全件同期で freee 側から消えていた件数 */
  markedDeleted: number;
  full: boolean;
};

/** 突合一覧の 1 行（freee 側の写し + CRM 側の紐付け） */
export type FreeePartnerListItem = {
  id: string;
  freeePartnerId: number;
  name: string;
  longName: string | null;
  nameKana: string | null;
  /** 1: 法人 / 2: 個人 / null: 未設定 */
  orgCode: number | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  invoiceRegistrationNumber: string | null;
  /** 法人のみインボイス番号から導出した 13 桁 */
  corporateNumber: string | null;
  available: boolean;
  freeeDeletedAt: string | null;
  freeeUpdateDate: string | null;
  linkStatus: "unlinked" | "auto" | "confirmed" | "excluded";
  companyId: string | null;
  companyName: string | null;
  accountId: string | null;
  accountName: string | null;
  accountCode: string | null;
  /** CRM と freee でインボイス番号が食い違っている（**CRM が正本**。警告のみ） */
  invoiceMismatch: boolean;
  crmInvoiceRegistrationNumber: string | null;
};

/** 紐付けの候補。自動確定には使わない弱いキーによる提案 */
export type FreeePartnerCandidate = {
  companyId: string;
  companyName: string;
  /** name: 名称の正規化一致 / domain: メールドメイン / phone: 電話番号 */
  reason: "name" | "domain" | "phone";
  invoiceRegistrationNumber: string | null;
  corporateNumber: string | null;
  /** その事業者に紐づく取引先の数（0 なら契約前） */
  accountCount: number;
};

/** freee と CRM の差分（1 相手分）。項目ごとに人がどちらを採るか選ぶ */
export type FreeePartnerDiff = {
  partnerId: string;
  companyId: string;
  /** freee 側の取引先名 */
  partnerName: string;
  /** CRM 側の事業者情報名 */
  companyName: string;
  fields: {
    field: string;
    label: string;
    crm: string | null;
    freee: string | null;
  }[];
};

/**
 * freee の担当者名に対する連絡先の候補。
 * **自動確定には使わない**（人が選ぶ）。
 */
export type FreeeContactCandidate = {
  contactId: string;
  contactName: string;
  /** exact_full: 姓+ミドル+名 / exact_name: 姓+名 / last_name: 姓だけ（弱い） */
  reason: "exact_full" | "exact_name" | "last_name";
  /** すでにこの事業者の主担当か */
  isPrimary: boolean;
};

/** freee と紐付いていない事業者情報。「連携する事業者を追加する」の対象 */
export type FreeeUnlinkedCompany = {
  companyId: string;
  companyCode: string;
  name: string;
  nameKana: string | null;
  phone: string | null;
  invoiceRegistrationNumber: string | null;
  corporateType: string | null;
};

/**
 * 事業者情報に似た freee 取引先（登録の前に見せる）。
 *
 * **freee は取引先名の重複を許す。** 確認せずに作ると表記ゆれで
 * 同じ相手が 2 つできるため、候補を出して人が判断する。
 */
export type FreeeCandidateForCompany = {
  partnerId: string;
  freeePartnerId: number;
  partnerName: string;
  /** freee 側の取引先コード。空なら未設定 */
  partnerCode: string | null;
  /** invoice: インボイス番号一致（強い） / name: 名称 / phone: 電話番号 */
  reason: "invoice" | "name" | "phone";
  invoiceRegistrationNumber: string | null;
  phone: string | null;
  /** 既に別の事業者と紐付いていれば、この候補は選べない */
  linkStatus: "unlinked" | "auto" | "confirmed" | "excluded";
};

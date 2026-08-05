export type CrmUserRole = "member" | "manager" | "admin";

export type ContactType = "individual" | "corporate_rep" | "employee" | "other";

export type ContractMethod = "paper" | "electronic" | "verbal";

export type CounterpartyType = "company" | "individual";

export type EmailLabel = "work" | "personal" | "other";

export type PhoneLabel = "work" | "mobile" | "home" | "fax" | "other";

export type BankAccountType = "ordinary" | "current" | "savings";

export type CareerType = "work" | "education" | "certification";

export type AccountContactRole = "primary" | "billing" | "technical" | "other";

export type DealActivityType = "email" | "call" | "meeting" | "visit" | "other";

export type ActivityLogType = "note" | "task" | "other";

export type ConstellationElement = "火" | "地" | "風" | "水";

// === Lead / Campaign 関連列挙型 ===

/** リードステージのslug値 */
export type LeadStageSlag =
  | "generation"
  | "nurturing"
  | "qualification"
  | "sales"
  | "opportunity"
  | "customer"
  | "dead";

/** リードステータスのcode値 */
export type LeadStatusCode =
  // 獲得ステージ
  | "list_ready"
  | "not_called"
  | "not_started"
  | "call_scheduled"
  // 育成ステージ
  | "calling"
  | "continuing_call"
  | "awaiting_recall"
  | "material_sent"
  // 選定ステージ
  | "appointment_obtained"
  // SQL ステージ
  | "negotiation"
  | "handed_over"
  // Customer ステージ
  | "closed_won"
  // Dead ステージ
  | "lost"
  | "declined"
  | "unreachable"
  | "approach_prohibited"
  | "opt_out";

/** 温度感コード */
export type LeadTemperatureCode = "hot" | "warm" | "cold";

/** キャンペーン種別 */
export type CampaignType = "generation" | "nurturing" | "qualification";

/** キャンペーンステータス */
export type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

/** リードカテゴリコード（M22 lead_categories.code 値）*/
export type LeadCategoryCode = "inquiry" | "mql" | "tql" | "sql";

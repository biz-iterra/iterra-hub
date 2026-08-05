/**
 * マスタ・エンティティのテーブル名 → 画面の呼び名。
 *
 * **マスタ管理と変更履歴の両方が使う。** 片方だけに持つと、履歴に内部名が
 * 出たまま残る（2026-08-05 に「システムログをそのまま表示している」と
 * 指摘を受けた）。対応の正本は CLAUDE.md「UI表示名と内部名の対応」。
 */

export const MASTER_LABELS: Record<string, string> = {
  pipeline_types: "パイプライン種別",
  deal_stages: "商談ステージ",
  deal_statuses: "商談ステータス",
  contract_types: "契約種別",
  corporate_types: "法人格",
  services: "サービス",
  lead_sources: "リードソース",
  account_types: "取引先種別",
  account_role_types: "取引先区分",
  account_statuses: "取引先ステータス",
  contact_statuses: "連絡先ステータス",
  company_statuses: "事業者情報ステータス",
  skill_categories: "スキルカテゴリ",
  skills: "スキル",
  project_statuses: "プロジェクトステータス",
  lead_categories: "リードカテゴリ",
  lead_activity_types: "対応種別",
  lead_stages: "リードステージ",
  lead_statuses: "リードステータス",
  lead_temperatures: "温度感",
  lead_call_statuses: "コールステータス",
  lead_large_segments: "大セグメント",
  lead_small_segments: "小セグメント",
  lead_company_sizes: "企業規模",
  lead_customer_activity_types: "顧客行動タイプ",
  lead_score_rules: "スコアリングルール",
  lead_score_thresholds: "スコア変換ルール",
};

/**
 * 業務データ（マスタ以外）のテーブル名。
 * 変更履歴はマスタと業務データの両方を記録する。
 */
export const ENTITY_LABELS: Record<string, string> = {
  companies: "事業者情報",
  contacts: "連絡先",
  accounts: "取引先",
  deals: "商談",
  contracts: "契約",
  leads: "リード",
  campaigns: "キャンペーン",
  projects: "プロジェクト",
  talents: "タレント",
  business_cards: "名刺",
  contact_emails: "連絡先のメール",
  contact_phones: "連絡先の電話番号",
  contact_social_accounts: "連絡先の SNS",
  addresses: "住所",
  entity_addresses: "住所の紐付け",
  company_domains: "事業者のドメイン",
  financial_info: "口座情報",
  account_contacts: "取引先の担当者",
  talent_skills: "タレントのスキル",
  talent_careers: "タレントの経歴",
  deal_services: "商談のサービス",
  lead_owners: "リードの副担当",
  lead_campaigns: "リードのキャンペーン",
  crm_users: "ユーザー",
};

/** テーブル名を画面の呼び名にする。対応が無ければ内部名のまま返す（隠さない） */
export function tableLabel(tableName: string): string {
  return ENTITY_LABELS[tableName] ?? MASTER_LABELS[tableName] ?? tableName;
}

/**
 * D軸×COシステムに属するスキルコードのプール
 * talent_grade_requirements.skill_thresholds の
 * skill_ids_any_pool: "d_co_system_skill_ids" から参照される
 *
 * 実際のスキルコードは seed/マスタの skill_code 列の値と一致させること。
 * マスタ追加時にここも更新する（Tech PM 確認後）。
 */
export const D_CO_SYSTEM_SKILL_IDS: readonly string[] = [
  "D01","D02","D04","D06","D07","D08","D09","D10","D11","D12",
  "D13","D14","D15","D16","D17","D18","D19","D20","D21","D22",
  "D23","D24","D25","D29","D30","D31",
] as const;

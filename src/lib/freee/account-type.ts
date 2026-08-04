/**
 * 口座種別の対応。
 *
 * freee: ordinary（普通）/ checking（当座）/ earmarked（納税準備）/ savings（貯蓄）
 * CRM  : ordinary（普通）/ current（当座）/ savings（貯蓄）
 *
 * **当座の綴りが違う**（freee は checking、CRM は current）。
 * 納税準備預金は CRM に該当が無いので、取り込みでは落とす。
 *
 * DB 側にも同じ対応がある（`freee_account_type_to_crm` / `crm_account_type_to_freee`）。
 * 取り込みは DB 関数、送信は TS と経路が分かれているため両方に必要。
 * **片方だけ直さないこと。**
 */
export function crmAccountTypeToFreee(type: string | null): string | null {
  switch ((type ?? "").trim()) {
    case "ordinary":
      return "ordinary";
    case "current":
      return "checking";
    case "savings":
      return "savings";
    default:
      return null;
  }
}

export function freeeAccountTypeToCrm(type: string | null): string | null {
  switch ((type ?? "").trim()) {
    case "ordinary":
      return "ordinary";
    case "checking":
      return "current";
    case "savings":
      return "savings";
    // earmarked（納税準備預金）は CRM に無い
    default:
      return null;
  }
}

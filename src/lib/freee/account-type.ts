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

/**
 * 比較のための正規化。**未設定は普通預金として扱う。**
 *
 * freee は口座種別に未設定を持てず、画面で何も選ばなくても API は
 * `ordinary` を返す。つまり freee 側の `ordinary` は「普通預金と決めた」では
 * なく「未設定、または普通預金」を意味する。CRM は NULL を取れるので、
 * 素で比べると**どちらも未設定なのに差分になる**（2026-08-06 の指摘）。
 *
 * 差分検出そのものは DB 関数（`detect_freee_partner_diffs`）が行う。
 * ここに同じ規則を置くのは、**TS 側で口座種別を比べる処理を足すときに
 * 別の規則を書かせない**ため。DB 側の `normalize_account_type` と対にしてある。
 */
export function normalizeAccountType(type: string | null | undefined): string {
  const trimmed = (type ?? "").trim();
  return trimmed === "" ? "ordinary" : trimmed;
}
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

/**
 * 取引先における連絡先の役割（`account_contacts.role`）。
 *
 * DB の CHECK 制約は 4 値（primary / billing / technical / other）だが、
 * **画面で選べるのは担当者と請求者の 2 つ**にしている（2026-08-04）。
 * 取引先の詳細を「担当者情報」「請求者情報」の 2 セクションに分けたため、
 * どちらにも入らない役割があると行き場が無くなる。
 * technical / other は導入時から使われていないので選択肢から外した
 * （CHECK は残してあるので、過去データがあっても表示はできる）。
 */

export const ACCOUNT_CONTACT_ROLES = [
  { value: "primary", label: "担当者" },
  { value: "billing", label: "請求者" },
] as const;

/** 表示だけに使う。選択肢から外した過去の役割もここでは名前を出す */
const ALL_ROLE_LABELS: Record<string, string> = {
  primary: "担当者",
  billing: "請求者",
  technical: "技術担当",
  other: "その他",
};

export function accountContactRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return ALL_ROLE_LABELS[role] ?? role;
}

/**
 * 連絡先の「窓口になっている取引先」に出すかどうか。
 * **担当者か請求者に入っているものだけ**を窓口として扱う。
 */
export function isCounterpartyRole(role: string | null | undefined): boolean {
  return role === "primary" || role === "billing";
}

/**
 * 取引先における連絡先の役割（`account_contacts.role`）。
 *
 * DB の CHECK 制約と同じ 4 値。表示名を画面ごとに書くとずれるので、
 * 選択肢とラベルをここに置く。
 */

export const ACCOUNT_CONTACT_ROLES = [
  { value: "primary", label: "主担当" },
  { value: "billing", label: "請求担当" },
  { value: "technical", label: "技術担当" },
  { value: "other", label: "その他" },
] as const;

export function accountContactRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return ACCOUNT_CONTACT_ROLES.find((r) => r.value === role)?.label ?? role;
}

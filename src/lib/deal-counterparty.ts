/**
 * 商談の相手先表示。
 *
 * 取引先（Account）は契約成立時に作られるため、契約前の商談は account_id が NULL になる。
 * その間の相手先は事業者情報 / 連絡先で示す。表示側で毎回この分岐を書くと
 * 画面ごとに出方がずれるので、ここに寄せる。
 *
 * 優先順位: 取引先 → 事業者情報 → 連絡先
 */

export type DealCounterpartySource = {
  account: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
  // 生成型では姓名とも nullable。名刺由来のデータで名が欠けることがある
  contact: {
    id: string;
    last_name: string | null;
    first_name: string | null;
  } | null;
};

export type DealCounterparty = {
  kind: "account" | "company" | "contact";
  label: string;
  href: string;
};

export function getDealCounterparty(
  deal: DealCounterpartySource
): DealCounterparty | null {
  if (deal.account) {
    return {
      kind: "account",
      label: deal.account.name,
      href: `/accounts/${deal.account.id}`,
    };
  }
  if (deal.company) {
    return {
      kind: "company",
      label: deal.company.name,
      href: `/companies/${deal.company.id}`,
    };
  }
  if (deal.contact) {
    const name = `${deal.contact.last_name ?? ""} ${deal.contact.first_name ?? ""}`.trim();
    return {
      kind: "contact",
      label: name,
      href: `/contacts/${deal.contact.id}`,
    };
  }
  return null;
}

/** テキストだけ欲しい場面（検索対象・title 属性など）向け */
export function getDealCounterpartyLabel(deal: DealCounterpartySource): string {
  return getDealCounterparty(deal)?.label ?? "";
}

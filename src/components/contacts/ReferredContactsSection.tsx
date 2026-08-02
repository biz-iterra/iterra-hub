import { UsersRound } from "lucide-react";

import { DetailSection } from "@/components/ui/DetailSection";
import { EntityLink } from "@/components/ui/EntityLink";
import type { ReferredCardRow } from "@/types/relations";

/**
 * この連絡先が紹介した相手。
 *
 * 紹介は名刺に紐づく（誰の紹介で会えたか）ので、ここはその逆引き。
 * 同じ人を別の場面で紹介していれば複数行になる。
 *
 * 「紹介が多い人」「紹介からの案件発生率」といった見方の入口になるが、
 * **集計は CRM では持たない**（別のアプリで扱う方針）。ここでは
 * 誰を紹介したかを辿れることだけを担う。
 */
export function ReferredContactsSection({ rows }: { rows: ReferredCardRow[] }) {
  if (rows.length === 0) return null;

  return (
    <DetailSection
      title="紹介した相手"
      icon={UsersRound}
      action={
        <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
          {rows.length} 件
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <div
            key={r.id}
            style={{
              padding: "0.625rem 0",
              borderBottom:
                i === rows.length - 1
                  ? "none"
                  : "1px solid var(--color-border-default)",
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              {r.contact ? (
                <EntityLink href={`/contacts/${r.contact.id}`}>
                  {[r.contact.last_name, r.contact.first_name]
                    .filter(Boolean)
                    .join(" ")}
                </EntityLink>
              ) : (
                <span style={{ fontSize: "0.875rem" }}>連絡先なし</span>
              )}

              <span style={{ fontSize: "0.75rem", color: "var(--color-sumi600)" }}>
                {r.company ? (
                  <EntityLink href={`/companies/${r.company.id}`}>
                    {r.company.name}
                  </EntityLink>
                ) : (
                  (r.company_name_raw ?? "所属不明")
                )}
              </span>
            </span>

            {r.referral_memo && (
              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "var(--color-sumi600)",
                  marginTop: "0.125rem",
                }}
              >
                {r.referral_memo}
              </span>
            )}
          </div>
        ))}
      </div>
    </DetailSection>
  );
}

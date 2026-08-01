import { Building2 } from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { EntityLink } from "@/components/ui/EntityLink";
import type { ContactAffiliationRef } from "@/types/relations";

/**
 * 連絡先の所属履歴。
 *
 * 名刺は「ある時点の所属のスナップショット」なので、会社・部署・役職を
 * 時系列で並べる。現在の所属が先頭に来る。
 * 転職・異動を跨いでも同じ人として追えることがこの表示の目的
 * （設計: docs/contact-identity.md）。
 */
export function AffiliationHistorySection({
  affiliations,
}: {
  affiliations: ContactAffiliationRef[];
}) {
  // 現在の所属 → 開始日の新しい順。日付不明は最後に回す
  const sorted = [...affiliations].sort((a, b) => {
    if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
    if (a.started_on && b.started_on) return b.started_on.localeCompare(a.started_on);
    if (a.started_on) return -1;
    if (b.started_on) return 1;
    return 0;
  });

  return (
    <DetailSection
      title="所属履歴"
      icon={Building2}
      action={
        sorted.length > 0 ? (
          <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
            {sorted.length} 件
          </span>
        ) : null
      }
    >
      {sorted.length === 0 ? (
        <p style={{ color: "var(--color-sumi500)", fontSize: "0.875rem", margin: 0 }}>
          所属の記録はまだありません
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sorted.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.625rem 0",
                borderBottom:
                  i === sorted.length - 1
                    ? "none"
                    : "1px solid var(--color-border-default)",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--color-sumi500)",
                  whiteSpace: "nowrap",
                  minWidth: "9.5rem",
                  paddingTop: "0.125rem",
                }}
              >
                {formatPeriod(a.started_on, a.ended_on)}
              </span>

              <span style={{ minWidth: 0, flex: 1 }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  {a.company ? (
                    <EntityLink href={`/companies/${a.company.id}`}>
                      {a.company.name}
                    </EntityLink>
                  ) : (
                    <span style={{ fontSize: "0.875rem" }}>
                      {a.company_name_raw ?? "—"}
                    </span>
                  )}
                  {a.is_current && (
                    <span
                      style={{
                        backgroundColor: "var(--color-terra)",
                        color: "#fff",
                        borderRadius: "var(--radius-badge)",
                        padding: "0.125rem 0.5rem",
                        fontSize: "0.625rem",
                      }}
                    >
                      現在
                    </span>
                  )}
                </span>

                {(a.department || a.job_title) && (
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "var(--color-sumi600)",
                      marginTop: "0.125rem",
                    }}
                  >
                    {[a.department, a.job_title].filter(Boolean).join(" ・ ")}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </DetailSection>
  );
}

/**
 * 在籍期間の表記。
 * 終了日が無ければ「〜」で開いたままにする（在籍中、または未確認）。
 */
function formatPeriod(
  startedOn: string | null,
  endedOn: string | null
): string {
  if (!startedOn && !endedOn) return "時期不明";
  const start = startedOn ? formatDate(startedOn) : "不明";
  const end = endedOn ? formatDate(endedOn) : "";
  return `${start} 〜 ${end}`;
}

function formatDate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${y}/${m}/${d}`;
}

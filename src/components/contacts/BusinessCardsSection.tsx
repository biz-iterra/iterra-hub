"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Check } from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import { EntityLink } from "@/components/ui/EntityLink";
import { useToast } from "@/components/ui/toast";
import { applyBusinessCardAsCurrent } from "@/actions/business-cards";
import { BusinessCardReferral } from "@/components/contacts/BusinessCardReferral";
import type { BusinessCardRef } from "@/types/relations";

/**
 * 連絡先が持つ名刺の一覧。
 *
 * 所属（会社・部署・役職）は名刺ごとの情報として並べる。取込元の登録日は
 * 在籍期間を表さないため**時系列としては扱わず**、どれが現在の所属かは
 * 人が選ぶ（docs/contact-identity.md § 5）。
 */
export function BusinessCardsSection({
  cards,
  contactId,
}: {
  cards: BusinessCardRef[];
  contactId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [applying, setApplying] = useState<string | null>(null);

  // 採用中を先頭に。あとは登録日の新しい順（順序の根拠ではなく見やすさのため）
  const sorted = [...cards].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    const ad = a.source_registered_on ?? "";
    const bd = b.source_registered_on ?? "";
    return bd.localeCompare(ad);
  });

  async function apply(cardId: string) {
    setApplying(cardId);
    const { error } = await applyBusinessCardAsCurrent(cardId);
    setApplying(null);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    showToast({ type: "success", message: "現在の所属を更新しました" });
    router.refresh();
  }

  return (
    <DetailSection
      title="名刺"
      icon={CreditCard}
      action={
        sorted.length > 0 ? (
          <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
            {sorted.length} 枚
          </span>
        ) : null
      }
    >
      {sorted.length === 0 ? (
        <p style={{ color: "var(--color-sumi500)", fontSize: "0.875rem", margin: 0 }}>
          名刺の記録はまだありません
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {sorted.map((c, i) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.75rem 0",
                borderBottom:
                  i === sorted.length - 1
                    ? "none"
                    : "1px solid var(--color-border-default)",
              }}
            >
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={styles.headline}>
                  {c.company ? (
                    <EntityLink href={`/companies/${c.company.id}`}>
                      {c.company.name}
                    </EntityLink>
                  ) : (
                    <span style={{ fontSize: "0.875rem" }}>
                      {c.company_name_raw ?? "所属不明"}
                    </span>
                  )}
                  {c.is_primary && <span style={styles.badge}>現在の所属</span>}
                </span>

                {(c.department || c.job_title) && (
                  <span style={styles.meta}>
                    {[c.department, c.job_title].filter(Boolean).join(" ・ ")}
                  </span>
                )}

                {/* この名刺の連絡手段。会社ドメインのメールが所属の裏付けになる */}
                {(c.contact_email || c.contact_phone) && (
                  <span style={styles.meta}>
                    {[c.contact_email?.email, c.contact_phone?.phone]
                      .filter(Boolean)
                      .join(" ・ ")}
                  </span>
                )}

                {c.source_registered_on && (
                  <span style={styles.note}>
                    {formatDate(c.source_registered_on)} に
                    {c.source === "eight" ? " Eight へ" : ""}登録
                  </span>
                )}

                {/* 誰の紹介で会えたのか。名刺ごとに持つ（転職後に別の人から
                    改めて紹介されることがある） */}
                <BusinessCardReferral card={c} contactId={contactId} />
              </span>

              {!c.is_primary && (
                <button
                  type="button"
                  style={{
                    ...styles.btn,
                    ...(applying === c.id ? { opacity: 0.6 } : {}),
                  }}
                  disabled={applying !== null}
                  onClick={() => apply(c.id)}
                >
                  <Check size={13} />
                  {applying === c.id ? "反映中..." : "現在の所属にする"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </DetailSection>
  );
}

function formatDate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${y}/${m}/${d}`;
}

const styles = {
  headline: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
  } as CSSProperties,
  badge: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-badge)",
    padding: "0.125rem 0.5rem",
    fontSize: "0.625rem",
  } as CSSProperties,
  meta: {
    display: "block",
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
    marginTop: "0.125rem",
  } as CSSProperties,
  note: {
    display: "block",
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    marginTop: "0.25rem",
  } as CSSProperties,
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    flexShrink: 0,
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.3125rem 0.625rem",
    fontSize: "0.75rem",
    cursor: "pointer",
  } as CSSProperties,
};

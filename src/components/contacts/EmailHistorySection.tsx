import { Mail, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { DetailSection } from "@/components/ui/DetailSection";
import type { EmailMessageWithContacts } from "@/types/relations";

/**
 * 連絡先とのメールのやり取り。
 *
 * 本文は CRM に保存していないため、件名・日時・向きだけを並べ、
 * 中身は Gmail のリンクで開く。件名から用件が分かるので一覧としては足り、
 * 契約書などの中身を CRM 側に複製しないで済む。
 */
export function EmailHistorySection({
  messages,
}: {
  messages: EmailMessageWithContacts[];
}) {
  return (
    <DetailSection
      title="アクティビティ"
      icon={Mail}
      action={
        messages.length > 0 ? (
          <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
            {messages.length} 件
          </span>
        ) : null
      }
    >
      {messages.length === 0 ? (
        <p
          style={{
            color: "var(--color-sumi500)",
            fontSize: "0.875rem",
            margin: 0,
          }}
        >
          メールのやり取りはまだありません
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {messages.map((m, i) => {
            const inbound = m.direction === "inbound";
            const isLast = i === messages.length - 1;
            return (
              <a
                key={m.id}
                // Gmail のメッセージを直接開く。CRM に本文が無いのでここが唯一の導線
                href={`https://mail.google.com/mail/u/0/#all/${m.gmail_message_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:bg-[var(--color-bg-hover)]"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.625rem",
                  padding: "0.625rem 0.5rem",
                  margin: "0 -0.5rem",
                  borderRadius: "var(--radius-sm)",
                  borderBottom: isLast
                    ? "none"
                    : "1px solid var(--color-border-default)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {/* 受信か送信かを向きで示す */}
                <span
                  title={inbound ? "受信" : "送信"}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 22,
                    height: 22,
                    borderRadius: "var(--radius-full)",
                    flexShrink: 0,
                    marginTop: "0.125rem",
                    backgroundColor: inbound
                      ? "rgba(59, 130, 246, 0.12)"
                      : "rgba(122, 165, 146, 0.16)",
                    color: inbound ? "#1E40AF" : "#4D7A65",
                  }}
                >
                  {inbound ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                </span>

                <span style={{ minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      color: "var(--color-text-body)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.subject || "(件名なし)"}
                  </span>
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.75rem",
                      color: "var(--color-sumi500)",
                      marginTop: "0.125rem",
                    }}
                  >
                    {formatDateTime(m.sent_at)}
                    {inbound && m.from_name ? ` ・ ${m.from_name}` : ""}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      )}
    </DetailSection>
  );
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

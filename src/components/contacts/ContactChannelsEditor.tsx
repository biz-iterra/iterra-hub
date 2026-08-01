"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Mail, Phone, Plus, Star, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  addContactChannel,
  countCardsUsingChannel,
  deleteContactChannel,
  setPrimaryContactChannel,
  updateContactChannelLabel,
} from "@/actions/contact-channels";

type Channel = "email" | "phone";

export type ChannelRow = {
  id: string;
  value: string;
  label: string | null;
  is_primary: boolean;
};

const LABELS: Record<Channel, { value: string; text: string }[]> = {
  email: [
    { value: "work", text: "勤務先" },
    { value: "personal", text: "個人" },
    { value: "other", text: "その他" },
  ],
  phone: [
    { value: "work", text: "勤務先" },
    { value: "mobile", text: "携帯" },
    { value: "home", text: "自宅" },
    { value: "fax", text: "FAX" },
    { value: "other", text: "その他" },
  ],
};

/**
 * 連絡先のメール・電話の増減。
 *
 * 1 人に複数の連絡手段が紐づくのは通常の状態で、増減も日常的に起きる。
 * 連絡先本体の保存とは独立して、行単位でその場で反映する
 * （本体の保存を待たずに済むよう、追加・削除は即時）。
 */
export function ContactChannelsEditor({
  contactId,
  channel,
  rows,
}: {
  contactId: string;
  channel: Channel;
  rows: ChannelRow[];
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [value, setValue] = useState("");
  const [label, setLabel] = useState(channel === "email" ? "work" : "work");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<{ row: ChannelRow; cards: number } | null>(
    null
  );

  const isEmail = channel === "email";
  const Icon = isEmail ? Mail : Phone;
  const title = isEmail ? "メールアドレス" : "電話番号";

  async function add() {
    if (!value.trim()) return;
    setBusy(true);
    const { error } = await addContactChannel(contactId, channel, value, label);
    setBusy(false);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    setValue("");
    showToast({ type: "success", message: `${title}を追加しました` });
    router.refresh();
  }

  async function changeLabel(row: ChannelRow, next: string) {
    const { error } = await updateContactChannelLabel(contactId, channel, row.id, next);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    router.refresh();
  }

  async function makePrimary(row: ChannelRow) {
    const { error } = await setPrimaryContactChannel(contactId, channel, row.id);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    showToast({ type: "success", message: "主にしました" });
    router.refresh();
  }

  /** 削除前に、この連絡手段を使っている名刺の枚数を調べて見せる */
  async function askDelete(row: ChannelRow) {
    const cards = await countCardsUsingChannel(contactId, channel, row.id);
    setTarget({ row, cards });
  }

  async function confirmDelete() {
    if (!target) return { error: "対象がありません" };
    const { error } = await deleteContactChannel(contactId, channel, target.row.id);
    if (error) return { error };
    setTarget(null);
    showToast({ type: "success", message: `${title}を削除しました` });
    router.refresh();
    return { error: null };
  }

  return (
    <>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <Icon size={15} style={{ color: "var(--color-sumi600)" }} />
          <span style={styles.title}>{title}</span>
          <span style={styles.count}>{rows.length} 件</span>
        </div>

        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((r, i) => (
              <div
                key={r.id}
                style={{
                  ...styles.row,
                  borderBottom:
                    i === rows.length - 1
                      ? "none"
                      : "1px solid var(--color-border-default)",
                }}
              >
                <button
                  type="button"
                  title={r.is_primary ? "主の連絡先" : "主にする"}
                  aria-label={r.is_primary ? "主の連絡先" : "主にする"}
                  style={styles.starBtn}
                  disabled={r.is_primary}
                  onClick={() => makePrimary(r)}
                >
                  <Star
                    size={14}
                    style={{
                      color: r.is_primary
                        ? "var(--color-terra)"
                        : "var(--color-sumi400)",
                    }}
                    fill={r.is_primary ? "var(--color-terra)" : "none"}
                  />
                </button>

                <span style={styles.value}>{r.value}</span>

                <select
                  style={styles.select}
                  value={r.label ?? "work"}
                  onChange={(e) => changeLabel(r, e.target.value)}
                >
                  {LABELS[channel].map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.text}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  title="削除"
                  aria-label={`${r.value} を削除`}
                  style={styles.delBtn}
                  onClick={() => askDelete(r)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={styles.addRow}>
          <input
            style={styles.input}
            type={isEmail ? "email" : "tel"}
            placeholder={isEmail ? "taro@example.com" : "090-1234-5678"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // フォーム内なので Enter で本体が送信されないようにする
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <select
            style={styles.select}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          >
            {LABELS[channel].map((l) => (
              <option key={l.value} value={l.value}>
                {l.text}
              </option>
            ))}
          </select>
          <button
            type="button"
            style={{ ...styles.addBtn, ...(busy ? { opacity: 0.6 } : {}) }}
            disabled={busy || !value.trim()}
            onClick={add}
          >
            <Plus size={14} />
            追加
          </button>
        </div>

        <p style={styles.note}>
          追加・削除はこの場で反映されます（下の「保存」を待ちません）。
        </p>
      </div>

      <ConfirmDialog
        open={target !== null}
        title={`${title}を削除します`}
        message={
          target
            ? [
                `「${target.row.value}」を削除します。`,
                target.cards > 0
                  ? `この連絡先を使っている名刺が ${target.cards} 枚あります。名刺は残りますが、連絡手段との紐付けは外れます。`
                  : "",
                target.row.is_primary && rows.length > 1
                  ? "主の連絡先のため、残りのうち最初に登録されたものが主になります。"
                  : "",
              ]
                .filter(Boolean)
                .join("\n")
            : ""
        }
        confirmLabel="削除する"
        danger
        onConfirm={confirmDelete}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  } as CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
  } as CSSProperties,
  title: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
  } as CSSProperties,
  count: {
    marginLeft: "auto",
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0",
  } as CSSProperties,
  value: {
    flex: 1,
    minWidth: 0,
    fontSize: "0.875rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as CSSProperties,
  starBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0.125rem",
    display: "inline-flex",
    flexShrink: 0,
  } as CSSProperties,
  delBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0.25rem",
    color: "var(--color-sumi500)",
    display: "inline-flex",
    flexShrink: 0,
  } as CSSProperties,
  select: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.25rem 0.5rem",
    fontSize: "0.75rem",
    backgroundColor: "#fff",
    flexShrink: 0,
  } as CSSProperties,
  addRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap",
  } as CSSProperties,
  input: {
    flex: 1,
    minWidth: 180,
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.4375rem 0.625rem",
    fontSize: "0.875rem",
  } as CSSProperties,
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    backgroundColor: "transparent",
    color: "var(--color-sumi700)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.4375rem 0.75rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
    flexShrink: 0,
  } as CSSProperties,
  note: {
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    margin: 0,
  } as CSSProperties,
};

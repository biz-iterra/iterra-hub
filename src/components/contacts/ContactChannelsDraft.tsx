"use client";

import { useState, type CSSProperties } from "react";
import { Mail, Phone, Plus, Star, Trash2 } from "lucide-react";

/**
 * 新規作成中の連絡先に持たせるメール・電話の下書き。
 *
 * 既存の連絡先に足すときは ContactChannelsEditor（その場で DB へ反映）を使う。
 * こちらは**まだ ID の無い相手**が対象なので、値を親の state に貯めておき、
 * 「作成」で本体と一緒に書き込む（DB 関数 create_contact_with_details）。
 * 見た目は編集画面と揃える。
 */

export type ChannelDraft = {
  value: string;
  label: string;
  is_primary: boolean;
};

type Channel = "email" | "phone";

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

const styles = {
  head: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
    marginBottom: "0.5rem",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.625rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    backgroundColor: "#fff",
    marginBottom: "0.375rem",
  } as CSSProperties,
  input: {
    flex: 1,
    minWidth: 0,
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.625rem",
    fontSize: "0.875rem",
  } as CSSProperties,
  select: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.5rem",
    fontSize: "0.8125rem",
    backgroundColor: "#fff",
  } as CSSProperties,
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0.25rem",
    display: "inline-flex",
    alignItems: "center",
    color: "var(--color-sumi500)",
  } as CSSProperties,
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    background: "none",
    border: "1px dashed var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    padding: "0.375rem 0.75rem",
    fontSize: "0.8125rem",
    color: "var(--color-terra)",
    cursor: "pointer",
  } as CSSProperties,
  hint: {
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    margin: "0.25rem 0 0 0",
  } as CSSProperties,
} as const;

export function ContactChannelsDraft({
  channel,
  rows,
  onChange,
}: {
  channel: Channel;
  rows: ChannelDraft[];
  onChange: (rows: ChannelDraft[]) => void;
}) {
  const isEmail = channel === "email";
  const [error, setError] = useState<string | null>(null);

  const title = isEmail ? "メールアドレス" : "電話番号";
  const Icon = isEmail ? Mail : Phone;

  const add = () => {
    // 1 件目は自動で主連絡先にする（表示側がどれを出すか決められるように）
    onChange([
      ...rows,
      { value: "", label: isEmail ? "work" : "work", is_primary: rows.length === 0 },
    ]);
  };

  const update = (index: number, patch: Partial<ChannelDraft>) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
    setError(null);
  };

  const remove = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    // 主連絡先を消したら先頭を繰り上げる（誰も主でない状態を作らない）
    if (next.length > 0 && !next.some((r) => r.is_primary)) {
      next[0] = { ...next[0], is_primary: true };
    }
    onChange(next);
  };

  const setPrimary = (index: number) => {
    onChange(rows.map((r, i) => ({ ...r, is_primary: i === index })));
  };

  return (
    <div>
      <div style={styles.head}>
        <Icon size={15} />
        {title}
      </div>

      {rows.map((row, i) => (
        <div key={i} style={styles.row}>
          <button
            type="button"
            style={{
              ...styles.iconBtn,
              color: row.is_primary ? "var(--color-soleil)" : "var(--color-sumi300)",
            }}
            onClick={() => setPrimary(i)}
            aria-label={row.is_primary ? "主連絡先" : "主連絡先にする"}
            title={row.is_primary ? "主連絡先" : "主連絡先にする"}
          >
            <Star size={15} fill={row.is_primary ? "currentColor" : "none"} />
          </button>

          <input
            type={isEmail ? "email" : "tel"}
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder={isEmail ? "yamada@example.co.jp" : "03-1234-5678"}
            style={styles.input}
            aria-label={`${title} ${i + 1}`}
          />

          <select
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
            style={styles.select}
            aria-label={`${title} ${i + 1} の種別`}
          >
            {LABELS[channel].map((l) => (
              <option key={l.value} value={l.value}>
                {l.text}
              </option>
            ))}
          </select>

          <button
            type="button"
            style={styles.iconBtn}
            onClick={() => remove(i)}
            aria-label={`${title} ${i + 1} を削除`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      <button type="button" style={styles.addBtn} onClick={add}>
        <Plus size={14} />
        {title}を追加
      </button>

      {error && (
        <p style={{ ...styles.hint, color: "var(--color-error)" }}>{error}</p>
      )}
      {rows.length === 0 && (
        <p style={styles.hint}>
          作成後に編集画面からでも追加できます。★ は主{isEmail ? "メール" : "電話"}です。
        </p>
      )}
    </div>
  );
}

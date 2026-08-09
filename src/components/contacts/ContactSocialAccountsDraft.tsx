"use client";

import { type CSSProperties } from "react";
import { MessageCircle, Plus, Trash2 } from "lucide-react";
import type { SocialService } from "@/actions/contact-social-accounts";
import { autoGridClass } from "@/lib/layout";

/**
 * 新規作成中の連絡先に持たせる SNS・チャットの下書き（T-0026）。
 *
 * メール・電話と同じく、まだ ID の無い相手が対象なので値を親の state に
 * 貯めておき、「作成」で本体と一緒に書き込む（DB 関数 create_contact_with_details）。
 * 既存の連絡先に足すときは SocialAccountsEditor（その場で DB へ反映）を使う。
 * サービスによって入れるものが違う（LINE ID / Chatwork のルーム ID / Slack は
 * ワークスペース + メンバー ID）ため、選んだサービスに合わせて欄を出し分ける
 * ロジックは SocialAccountsEditor の Fields と揃える。
 */

export type SocialAccountDraft = {
  service_id: string;
  account_id: string;
  workspace: string;
  display_name: string;
};

const EMPTY_ROW: SocialAccountDraft = {
  service_id: "",
  account_id: "",
  workspace: "",
  display_name: "",
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
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    backgroundColor: "#fff",
    padding: "0.625rem",
    marginBottom: "0.375rem",
  } as CSSProperties,
  rowHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: "0.375rem",
  } as CSSProperties,
  label: {
    display: "block",
    fontSize: "0.6875rem",
    fontWeight: 600,
    color: "var(--color-sumi600)",
    marginBottom: "0.1875rem",
  } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.625rem",
    width: "100%",
    fontSize: "0.875rem",
  } as CSSProperties,
  select: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.625rem",
    width: "100%",
    fontSize: "0.875rem",
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
    lineHeight: 1.6,
  } as CSSProperties,
} as const;

export function ContactSocialAccountsDraft({
  services,
  rows,
  onChange,
}: {
  services: SocialService[];
  rows: SocialAccountDraft[];
  onChange: (rows: SocialAccountDraft[]) => void;
}) {
  const serviceOf = (id: string) => services.find((s) => s.id === id);

  const add = () => {
    onChange([...rows, { ...EMPTY_ROW }]);
  };

  const update = (index: number, patch: Partial<SocialAccountDraft>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const remove = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div style={styles.head}>
        <MessageCircle size={15} />
        SNS・チャット
      </div>

      {rows.map((row, i) => {
        const service = serviceOf(row.service_id);
        return (
          <div key={i} style={styles.row}>
            <div style={styles.rowHead}>
              <button
                type="button"
                style={styles.iconBtn}
                onClick={() => remove(i)}
                aria-label={`SNS・チャット ${i + 1} を削除`}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className={autoGridClass}>
              <div>
                <label style={styles.label}>サービス</label>
                <select
                  value={row.service_id}
                  onChange={(e) => update(i, { service_id: e.target.value })}
                  style={styles.select}
                  aria-label={`SNS・チャット ${i + 1} のサービス`}
                >
                  <option value="">-- 選択 --</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {service?.requires_workspace && (
                <div>
                  <label style={styles.label}>{service.workspace_label}</label>
                  <input
                    value={row.workspace}
                    onChange={(e) => update(i, { workspace: e.target.value })}
                    style={styles.input}
                    placeholder="T01ABCDEF"
                    aria-label={`SNS・チャット ${i + 1} の${service.workspace_label}`}
                  />
                </div>
              )}

              <div>
                <label style={styles.label}>{service?.account_label ?? "ID"}</label>
                <input
                  value={row.account_id}
                  onChange={(e) => update(i, { account_id: e.target.value })}
                  style={styles.input}
                  aria-label={`SNS・チャット ${i + 1} の${service?.account_label ?? "ID"}`}
                />
              </div>

              <div>
                <label style={styles.label}>表示名</label>
                <input
                  value={row.display_name}
                  onChange={(e) => update(i, { display_name: e.target.value })}
                  style={styles.input}
                  placeholder="同じサービスに複数あるとき"
                  aria-label={`SNS・チャット ${i + 1} の表示名`}
                />
              </div>
            </div>
            {service?.hint && <p style={styles.hint}>{service.hint}</p>}
          </div>
        );
      })}

      <button type="button" style={styles.addBtn} onClick={add}>
        <Plus size={14} />
        SNS・チャットを追加
      </button>

      {rows.length === 0 && (
        <p style={styles.hint}>作成後に編集画面からでも追加できます。</p>
      )}
    </div>
  );
}

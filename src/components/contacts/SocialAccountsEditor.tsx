"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/toast";
import {
  createContactSocialAccount,
  deleteContactSocialAccount,
  updateContactSocialAccount,
  type ContactSocialAccount,
  type SocialService,
} from "@/actions/contact-social-accounts";
import { buildSocialDmUrl } from "@/lib/social-links";

/**
 * SNS・チャットの連絡口の増減。
 *
 * メールや電話と同じく、本体の保存を待たずにその場で反映する。
 * サービスによって入れるものが違う（LINE ID / Chatwork のルーム ID /
 * Slack はワークスペース + メンバー ID）ので、選んだサービスに合わせて
 * 欄と案内を差し替える。
 */

type Draft = {
  service_id: string;
  account_id: string;
  workspace: string;
  display_name: string;
};

const EMPTY: Draft = { service_id: "", account_id: "", workspace: "", display_name: "" };

const styles = {
  list: { display: "flex", flexDirection: "column", gap: "0.5rem" } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    padding: "0.5rem 0.75rem",
  } as CSSProperties,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "1.75rem",
    height: "1.75rem",
    padding: "0 0.375rem",
    borderRadius: "9999px",
    fontSize: "0.6875rem",
    fontWeight: 700,
    color: "#fff",
    flexShrink: 0,
  } as CSSProperties,
  value: {
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  sub: {
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
  } as CSSProperties,
  empty: { color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 } as CSSProperties,
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.5rem",
    height: "1.5rem",
    flexShrink: 0,
    border: "none",
    backgroundColor: "transparent",
    borderRadius: "var(--radius-sm)",
    color: "var(--color-sumi500)",
    cursor: "pointer",
    padding: 0,
  } as CSSProperties,
  formCard: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    padding: "0.75rem",
    marginTop: "0.5rem",
  } as CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))",
    gap: "0.75rem",
  } as CSSProperties,
  label: {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi700)",
    marginBottom: "0.25rem",
  } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.5rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
  } as CSSProperties,
  hint: {
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
    margin: "0.5rem 0 0 0",
    lineHeight: 1.6,
  } as CSSProperties,
  actions: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.75rem",
    justifyContent: "flex-end",
  } as CSSProperties,
  btnPrimary: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 1rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 1rem",
    fontSize: "0.8125rem",
    color: "var(--color-text-body)",
    cursor: "pointer",
  } as CSSProperties,
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    border: "1px solid var(--color-border-default)",
    backgroundColor: "transparent",
    borderRadius: "var(--radius-button)",
    padding: "0.25rem 0.625rem",
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    cursor: "pointer",
    marginTop: "0.5rem",
  } as CSSProperties,
};

function Fields({
  draft,
  service,
  services,
  onChange,
  disabled,
  lockService,
}: {
  draft: Draft;
  service: SocialService | undefined;
  services: SocialService[];
  onChange: (next: Draft) => void;
  disabled: boolean;
  /** 直すときはサービスを変えさせない（別物として足し直す方が分かりやすい） */
  lockService?: boolean;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <>
      <div style={styles.grid}>
        <div>
          <label style={styles.label}>サービス *</label>
          <select
            style={styles.input}
            value={draft.service_id}
            onChange={(e) => set("service_id", e.target.value)}
            disabled={disabled || lockService}
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
            <label style={styles.label}>{service.workspace_label} *</label>
            <input
              style={styles.input}
              value={draft.workspace}
              onChange={(e) => set("workspace", e.target.value)}
              disabled={disabled}
              placeholder="T01ABCDEF"
            />
          </div>
        )}

        <div>
          <label style={styles.label}>{service?.account_label ?? "ID"} *</label>
          <input
            style={styles.input}
            value={draft.account_id}
            onChange={(e) => set("account_id", e.target.value)}
            disabled={disabled}
          />
        </div>

        <div>
          <label style={styles.label}>表示名</label>
          <input
            style={styles.input}
            value={draft.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            disabled={disabled}
            placeholder="同じサービスに複数あるとき"
          />
        </div>
      </div>
      {service?.hint && <p style={styles.hint}>{service.hint}</p>}
    </>
  );
}

export function SocialAccountsEditor({
  contactId,
  services,
  accounts,
}: {
  contactId: string;
  services: SocialService[];
  accounts: ContactSocialAccount[];
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const serviceOf = (id: string) => services.find((s) => s.id === id);

  async function run(fn: () => Promise<{ error: string | null }>) {
    setBusy(true);
    try {
      const result = await fn();
      if (result.error) {
        showToast({ type: "error", message: result.error });
        return false;
      }
      showToast({ type: "success", message: "保存しました" });
      router.refresh();
      return true;
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  function validate(d: Draft): string | null {
    if (!d.service_id) return "サービスを選んでください";
    if (!d.account_id.trim()) return "ID を入力してください";
    const service = serviceOf(d.service_id);
    if (service?.requires_workspace && !d.workspace.trim()) {
      return `${service.workspace_label}を入力してください`;
    }
    return null;
  }

  async function add() {
    const message = validate(draft);
    if (message) {
      showToast({ type: "error", message });
      return;
    }
    const ok = await run(async () => {
      const { error } = await createContactSocialAccount({
        ...draft,
        contact_id: contactId,
      });
      return { error };
    });
    if (ok) {
      setAdding(false);
      setDraft(EMPTY);
    }
  }

  async function saveEdit(id: string) {
    const message = validate(editDraft);
    if (message) {
      showToast({ type: "error", message });
      return;
    }
    const ok = await run(async () => {
      const { error } = await updateContactSocialAccount(id, editDraft);
      return { error };
    });
    if (ok) setEditing(null);
  }

  return (
    <div>
      {accounts.length === 0 ? (
        <p style={styles.empty}>登録されていません</p>
      ) : (
        <div style={styles.list}>
          {accounts.map((account) => {
            const service = account.service ?? serviceOf(account.service_id);
            if (editing === account.id) {
              return (
                <div key={account.id} style={styles.formCard}>
                  <Fields
                    draft={editDraft}
                    service={serviceOf(editDraft.service_id)}
                    services={services}
                    onChange={setEditDraft}
                    disabled={busy}
                    lockService
                  />
                  <div style={styles.actions}>
                    <button
                      type="button"
                      style={styles.btnOutline}
                      onClick={() => setEditing(null)}
                      disabled={busy}
                    >
                      やめる
                    </button>
                    <button
                      type="button"
                      style={styles.btnPrimary}
                      onClick={() => saveEdit(account.id)}
                      disabled={busy}
                    >
                      保存
                    </button>
                  </div>
                </div>
              );
            }

            const url = service ? buildSocialDmUrl(service, account) : null;

            return (
              <div key={account.id} style={styles.row}>
                <span
                  style={{
                    ...styles.badge,
                    backgroundColor: service?.color ?? "var(--color-sumi400)",
                  }}
                >
                  {service?.short_label ?? "?"}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={styles.value}>
                    {account.account_id}
                    {account.workspace && ` @ ${account.workspace}`}
                  </div>
                  {account.display_name && (
                    <div style={styles.sub}>{account.display_name}</div>
                  )}
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="開いて確かめる"
                    title="開いて確かめる"
                    className="hover:bg-[var(--color-bg-hover)]"
                    style={styles.iconButton}
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditDraft({
                      service_id: account.service_id,
                      account_id: account.account_id,
                      workspace: account.workspace ?? "",
                      display_name: account.display_name ?? "",
                    });
                    setEditing(account.id);
                  }}
                  disabled={busy}
                  style={{ ...styles.btnOutline, padding: "0.125rem 0.5rem" }}
                >
                  直す
                </button>
                <button
                  type="button"
                  onClick={() =>
                    run(async () => {
                      const { error } = await deleteContactSocialAccount(account.id);
                      return { error };
                    })
                  }
                  disabled={busy}
                  aria-label="削除"
                  title="削除"
                  className="hover:bg-[var(--color-bg-hover)]"
                  style={{ ...styles.iconButton, color: "var(--color-error)" }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <div style={styles.formCard}>
          <Fields
            draft={draft}
            service={serviceOf(draft.service_id)}
            services={services}
            onChange={setDraft}
            disabled={busy}
          />
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.btnOutline}
              onClick={() => {
                setAdding(false);
                setDraft(EMPTY);
              }}
              disabled={busy}
            >
              やめる
            </button>
            <button type="button" style={styles.btnPrimary} onClick={add} disabled={busy}>
              追加
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="hover:bg-[var(--color-bg-hover)]"
          style={styles.addButton}
        >
          <Plus size={12} />
          連絡口を追加
        </button>
      )}
    </div>
  );
}

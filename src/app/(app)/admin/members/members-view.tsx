"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Pencil, RotateCcw, UserPlus } from "lucide-react";

import {
  createMember,
  setMemberActive,
  updateMember,
  type MemberRow,
} from "@/actions/members";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToneBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";
import { detailContainerStyle } from "@/lib/layout";

const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  manager: "マネージャー",
  member: "メンバー",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * 社内メンバーの管理。
 *
 * **消さずに止める。** 利用者の ID は過去の記録の作成者として参照されており、
 * 消すと辿れなくなる。停止すると CRM の利用も Auth のログインも塞がる。
 */
export function MembersView({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    full_name_kana: "",
    role: "member",
  });
  const [target, setTarget] = useState<{ member: MemberRow; next: boolean } | null>(
    null
  );

  // 氏名と権限は行の中で直す。**メールアドレスは変えられない**
  // （CRM・Auth・Cloudflare Access が同じアドレスで結び付いているため）
  const [editing, setEditing] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    full_name_kana: "",
    role: "member",
  });

  function startEdit(m: MemberRow) {
    setEditing(m.id);
    setEditForm({
      full_name: m.full_name,
      full_name_kana: m.full_name_kana ?? "",
      role: m.role,
    });
  }

  async function saveEdit(memberId: string) {
    setSavingEdit(true);
    const { error: err } = await updateMember(memberId, editForm);
    setSavingEdit(false);

    if (err) {
      showToast({ type: "error", message: err });
      return;
    }
    showToast({ type: "success", message: "メンバー情報を更新しました" });
    setEditing(null);
    router.refresh();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error: err } = await createMember(form);
    setSaving(false);

    if (err) {
      // 入力に紐づくものはその場に、それ以外はトーストで知らせる
      if (isFieldValidationError(err)) setError(err);
      else showToast({ type: "error", message: err });
      return;
    }

    showToast({ type: "success", message: "メンバーを追加しました" });
    setForm({ email: "", full_name: "", full_name_kana: "", role: "member" });
    setAdding(false);
    router.refresh();
  }

  async function applyActive() {
    if (!target) return { error: "対象がありません" };
    const { error: err } = await setMemberActive(target.member.id, target.next);
    if (err) return { error: err };

    showToast({
      type: "success",
      message: target.next ? "利用を再開しました" : "利用を停止しました",
    });
    setTarget(null);
    router.refresh();
    return { error: null };
  }

  return (
    <div style={detailContainerStyle}>
      <Link
        href="/admin"
        className="hover:bg-[var(--color-bg-hover)]"
        style={styles.backLink}
      >
        <ArrowLeft size={14} />
        各種設定
      </Link>

      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>社内メンバー</h1>
          <p style={styles.sub}>
            CRM を使う人の一覧。停止すると CRM の利用もログインも塞がります。
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            style={styles.btnPrimary}
            onClick={() => setAdding(true)}
          >
            <UserPlus size={14} />
            メンバーを追加
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={submit} style={styles.card}>
          <h2 style={styles.sectionTitle}>メンバーを追加</h2>
          <p style={styles.note}>
            パスワードは設定しません。Cloudflare Access を通って入ります
            （個別に要る場合は本人がパスワード再設定を行ってください）。
          </p>

          <div style={styles.grid}>
            <div>
              <label style={styles.label}>メールアドレス *</label>
              <input
                type="email"
                required
                style={styles.input}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@iterra.jp"
              />
            </div>
            <div>
              <label style={styles.label}>氏名 *</label>
              <input
                type="text"
                required
                style={styles.input}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <label style={styles.label}>フリガナ</label>
              <input
                type="text"
                style={styles.input}
                value={form.full_name_kana}
                onChange={(e) =>
                  setForm({ ...form, full_name_kana: e.target.value })
                }
              />
            </div>
            <div>
              <label style={styles.label}>権限 *</label>
              <select
                style={styles.input}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="member">メンバー</option>
                <option value="manager">マネージャー</option>
                <option value="admin">管理者</option>
              </select>
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.formActions}>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              {saving ? "追加中..." : "追加する"}
            </button>
            <button
              type="button"
              style={styles.btnGhost}
              className="hover:bg-[var(--color-bg-hover)]"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              disabled={saving}
            >
              やめる
            </button>
          </div>
        </form>
      )}

      <div style={styles.tableCard}>
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
              {["氏名", "メールアドレス", "権限", "状態", "最終ログイン", "作成日"].map(
                (label) => (
                  <th key={label} style={styles.th}>
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isEditing = editing === m.id;

              return (
                <tr key={m.id} style={styles.tr}>
                  <td style={styles.td} title={m.full_name}>
                    {isEditing ? (
                      <span style={styles.inlineFields}>
                        <input
                          type="text"
                          style={styles.inlineInput}
                          value={editForm.full_name}
                          onChange={(e) =>
                            setEditForm({ ...editForm, full_name: e.target.value })
                          }
                          aria-label="氏名"
                        />
                        <input
                          type="text"
                          style={styles.inlineInput}
                          value={editForm.full_name_kana}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              full_name_kana: e.target.value,
                            })
                          }
                          placeholder="フリガナ"
                          aria-label="フリガナ"
                        />
                      </span>
                    ) : (
                      <>
                        {m.full_name}
                        {m.full_name_kana && (
                          <span style={styles.kana}>{m.full_name_kana}</span>
                        )}
                      </>
                    )}
                  </td>
                  <td style={styles.td} title={m.email}>
                    {m.email}
                  </td>
                  <td style={styles.td}>
                    {isEditing ? (
                      <select
                        style={styles.inlineInput}
                        value={editForm.role}
                        onChange={(e) =>
                          setEditForm({ ...editForm, role: e.target.value })
                        }
                        aria-label="権限"
                      >
                        <option value="member">メンバー</option>
                        <option value="manager">マネージャー</option>
                        <option value="admin">管理者</option>
                      </select>
                    ) : (
                      (ROLE_LABELS[m.role] ?? m.role)
                    )}
                  </td>
                  <td style={styles.td}>
                    <ToneBadge tone={m.is_active ? "success" : "neutral"}>
                      {m.is_active ? "利用中" : "停止"}
                    </ToneBadge>
                  </td>
                  <td style={styles.td}>
                    {m.last_sign_in_at ? (
                      formatDateTime(m.last_sign_in_at)
                    ) : (
                      <span style={{ color: "var(--color-sumi400)" }}>未ログイン</span>
                    )}
                  </td>
                  <td style={styles.tdActions}>
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          style={styles.saveBtn}
                          onClick={() => saveEdit(m.id)}
                          disabled={savingEdit}
                        >
                          {savingEdit ? "保存中..." : "保存"}
                        </button>
                        <button
                          type="button"
                          style={styles.cancelBtn}
                          className="hover:bg-[var(--color-bg-hover)]"
                          onClick={() => setEditing(null)}
                          disabled={savingEdit}
                        >
                          やめる
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ color: "var(--color-sumi600)" }}>
                          {formatDate(m.created_at)}
                        </span>
                        <button
                          type="button"
                          style={styles.iconBtn}
                          className="hover:bg-[var(--color-bg-hover)]"
                          onClick={() => startEdit(m)}
                          aria-label="氏名と権限を変更"
                          title="氏名と権限を変更"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          style={styles.iconBtn}
                          className="hover:bg-[var(--color-bg-hover)]"
                          onClick={() => setTarget({ member: m, next: !m.is_active })}
                          aria-label={m.is_active ? "利用を停止" : "利用を再開"}
                          title={m.is_active ? "利用を停止" : "利用を再開"}
                        >
                          {m.is_active ? <Ban size={13} /> : <RotateCcw size={13} />}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={target !== null}
        title={target?.next ? "利用を再開します" : "利用を停止します"}
        message={
          target
            ? target.next
              ? `「${target.member.full_name}」が再び CRM を使えるようになります。`
              : `「${target.member.full_name}」は CRM を使えなくなり、ログインもできなくなります。\n過去の記録は残ります（消しません）。`
            : ""
        }
        confirmLabel={target?.next ? "再開する" : "停止する"}
        danger={!target?.next}
        onConfirm={applyActive}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

const styles = {
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    borderRadius: "var(--radius-sm)",
    padding: "0.125rem 0.375rem",
    margin: "0 0 0.75rem -0.375rem",
  } as CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 600,
    margin: "0 0 0.375rem 0",
  } as CSSProperties,
  sub: {
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    margin: 0,
    lineHeight: 1.6,
  } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.25rem",
    marginBottom: "1.25rem",
  } as CSSProperties,
  sectionTitle: {
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 0.375rem 0",
  } as CSSProperties,
  note: {
    color: "var(--color-sumi600)",
    fontSize: "0.75rem",
    margin: "0 0 1rem 0",
    lineHeight: 1.6,
  } as CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "1rem",
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
    padding: "0.5rem 0.75rem",
    width: "100%",
    fontSize: "0.875rem",
    outline: "none",
    backgroundColor: "#fff",
    fontFamily: "inherit",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.8125rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
  formActions: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "1rem",
  } as CSSProperties,
  tableCard: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    overflowX: "auto",
  } as CSSProperties,
  th: {
    padding: "0.75rem 1rem",
    textAlign: "left" as const,
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi600)",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  tr: {
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  td: {
    padding: "0.75rem 1rem",
    color: "var(--color-text-list)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  tdActions: {
    padding: "0.75rem 1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.5rem",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  kana: {
    display: "block",
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
  inlineFields: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  } as CSSProperties,
  inlineInput: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.25rem 0.5rem",
    width: "100%",
    fontSize: "0.8125rem",
    backgroundColor: "#fff",
    fontFamily: "inherit",
  } as CSSProperties,
  saveBtn: {
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.25rem 0.75rem",
    fontSize: "0.75rem",
    cursor: "pointer",
    flexShrink: 0,
  } as CSSProperties,
  cancelBtn: {
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.25rem 0.75rem",
    fontSize: "0.75rem",
    cursor: "pointer",
    flexShrink: 0,
  } as CSSProperties,
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    border: "1px solid var(--color-border-default)",
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    flexShrink: 0,
  } as CSSProperties,
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    cursor: "pointer",
    flexShrink: 0,
  } as CSSProperties,
  btnGhost: {
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    cursor: "pointer",
  } as CSSProperties,
};

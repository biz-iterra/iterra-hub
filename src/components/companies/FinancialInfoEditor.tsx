"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Plus, Star, Trash2, X } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  createFinancialInfo,
  deleteFinancialInfo,
  updateFinancialInfo,
  type FinancialInfoRow,
} from "@/actions/financial-info";
import { ACCOUNT_TYPES, accountTypeLabel } from "@/lib/validators/financial-info";
import { autoGridClass } from "@/lib/layout";

/**
 * 金融機関情報（振込先の口座）の増減。
 *
 * 1 つの事業者が複数の口座を持てる（本店口座と支払専用口座など）ので、
 * 住所と同じく本体の保存とは切り離して、この場で反映する。
 *
 * **表示できるのは manager 以上、変えられるのは admin だけ。** 口座番号を含むため。
 * 出し分けは呼び出し側が行い、ここは渡された `editable` に従う。
 */

type Draft = {
  bank_name: string;
  bank_code: string;
  branch_name: string;
  branch_code: string;
  account_type: string;
  account_number: string;
  account_holder: string;
  account_holder_kana: string;
};

const EMPTY: Draft = {
  bank_name: "",
  bank_code: "",
  branch_name: "",
  branch_code: "",
  account_type: "ordinary",
  account_number: "",
  account_holder: "",
  account_holder_kana: "",
};

function toDraft(row: FinancialInfoRow): Draft {
  return {
    bank_name: row.bank_name ?? "",
    bank_code: row.bank_code ?? "",
    branch_name: row.branch_name ?? "",
    branch_code: row.branch_code ?? "",
    // **未設定は「普通」で開く。** freee は口座種別に未設定を持てず、
    // 何も選ばなくても ordinary が返る。CRM だけ空を許すと突合のたびに
    // 「どちらも未設定」が差分として並ぶ（2026-08-06。§26.11）
    account_type: row.account_type ?? "ordinary",
    account_number: row.account_number ?? "",
    account_holder: row.account_holder ?? "",
    account_holder_kana: row.account_holder_kana ?? "",
  };
}

const styles = {
  list: { display: "flex", flexDirection: "column", gap: "0.75rem" } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    padding: "0.75rem",
  } as CSSProperties,
  bank: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
  } as CSSProperties,
  detail: {
    color: "var(--color-sumi600)",
    fontSize: "0.8125rem",
    marginTop: "0.25rem",
    lineHeight: 1.6,
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
  formCard: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    padding: "0.75rem",
    marginTop: "0.75rem",
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
    marginTop: "0.75rem",
  } as CSSProperties,
};

/** 口座の要点を 1 行に。桁を欠いても読めるよう、あるものだけ繋ぐ */
function summarize(row: FinancialInfoRow): string {
  const branch = [row.branch_name, row.branch_code && `(${row.branch_code})`]
    .filter(Boolean)
    .join(" ");
  const account = [accountTypeLabel(row.account_type), row.account_number]
    .filter(Boolean)
    .join(" ");
  return [branch, account].filter(Boolean).join(" / ") || "—";
}

function Fields({
  draft,
  onChange,
  disabled,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value });

  return (
    <div className={autoGridClass}>
      <div>
        <label style={styles.label}>金融機関名 *</label>
        <input
          style={styles.input}
          value={draft.bank_name}
          onChange={(e) => set("bank_name", e.target.value)}
          disabled={disabled}
          placeholder="○○銀行"
        />
      </div>
      <div>
        <label style={styles.label}>金融機関コード</label>
        <input
          style={styles.input}
          value={draft.bank_code}
          onChange={(e) => set("bank_code", e.target.value)}
          disabled={disabled}
          inputMode="numeric"
          placeholder="0001"
        />
      </div>
      <div>
        <label style={styles.label}>支店名</label>
        <input
          style={styles.input}
          value={draft.branch_name}
          onChange={(e) => set("branch_name", e.target.value)}
          disabled={disabled}
          placeholder="本店営業部"
        />
      </div>
      <div>
        <label style={styles.label}>支店コード</label>
        <input
          style={styles.input}
          value={draft.branch_code}
          onChange={(e) => set("branch_code", e.target.value)}
          disabled={disabled}
          inputMode="numeric"
          placeholder="001"
        />
      </div>
      <div>
        <label style={styles.label}>口座種別</label>
        <select
          style={styles.input}
          value={draft.account_type}
          onChange={(e) => set("account_type", e.target.value)}
          disabled={disabled}
        >
          {/* **未選択の選択肢は置かない。** freee 側に「未設定」が無いので、
              空にできても意味が無く、突合で差分に見えるだけ */}
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={styles.label}>口座番号</label>
        <input
          style={styles.input}
          value={draft.account_number}
          onChange={(e) => set("account_number", e.target.value)}
          disabled={disabled}
          inputMode="numeric"
          placeholder="1234567"
        />
      </div>
      <div>
        <label style={styles.label}>口座名義</label>
        <input
          style={styles.input}
          value={draft.account_holder}
          onChange={(e) => set("account_holder", e.target.value)}
          disabled={disabled}
        />
      </div>
      <div>
        <label style={styles.label}>口座名義（カナ）</label>
        <input
          style={styles.input}
          value={draft.account_holder_kana}
          onChange={(e) => set("account_holder_kana", e.target.value)}
          disabled={disabled}
          placeholder="カ）イテラ"
        />
      </div>
    </div>
  );
}

export function FinancialInfoEditor({
  companyId,
  rows,
  editable = true,
}: {
  companyId: string;
  rows: FinancialInfoRow[];
  /** 変えられるのは admin だけ。false なら閲覧に徹する */
  editable?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<FinancialInfoRow | null>(null);

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

  async function add() {
    if (!draft.bank_name.trim()) {
      showToast({ type: "error", message: "金融機関名は必須です" });
      return;
    }
    const ok = await run(async () => {
      const { error } = await createFinancialInfo({ ...draft, company_id: companyId });
      return { error };
    });
    if (ok) {
      setAdding(false);
      setDraft(EMPTY);
    }
  }

  async function saveEdit(id: string) {
    if (!editDraft.bank_name.trim()) {
      showToast({ type: "error", message: "金融機関名は必須です" });
      return;
    }
    // 編集開始時点の updated_at を送って後勝ちを防ぐ
    const current = rows.find((r) => r.id === id);
    const ok = await run(async () => {
      const { error } = await updateFinancialInfo(id, {
        ...editDraft,
        expected_updated_at: current?.updated_at ?? undefined,
      });
      return { error };
    });
    if (ok) setEditing(null);
  }

  return (
    <div>
      {rows.length === 0 ? (
        <p style={styles.empty}>登録されていません</p>
      ) : (
        <div style={styles.list}>
          {rows.map((row) =>
            editing === row.id ? (
              <div key={row.id} style={styles.formCard}>
                <Fields draft={editDraft} onChange={setEditDraft} disabled={busy} />
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
                    onClick={() => saveEdit(row.id)}
                    disabled={busy}
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <div key={row.id} style={styles.row}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={styles.bank}>
                    {row.is_primary && (
                      <Star size={12} style={{ color: "var(--color-terra)" }} />
                    )}
                    {row.bank_name}
                    {row.bank_code && (
                      <span
                        style={{
                          color: "var(--color-sumi500)",
                          fontSize: "0.75rem",
                          fontWeight: 400,
                        }}
                      >
                        ({row.bank_code})
                      </span>
                    )}
                  </span>
                  <div style={styles.detail}>{summarize(row)}</div>
                  {(row.account_holder || row.account_holder_kana) && (
                    <div style={styles.detail}>
                      {[row.account_holder, row.account_holder_kana]
                        .filter(Boolean)
                        .join(" / ")}
                    </div>
                  )}
                </div>
                {editable && (
                  <>
                    {!row.is_primary && (
                      <button
                        type="button"
                        onClick={() =>
                          run(async () => {
                            const { error } = await updateFinancialInfo(row.id, {
                              is_primary: true,
                              expected_updated_at: row.updated_at ?? undefined,
                            });
                            return { error };
                          })
                        }
                        disabled={busy}
                        aria-label="主口座にする"
                        title="主口座にする"
                        className="hover:bg-[var(--color-bg-hover)]"
                        style={styles.iconButton}
                      >
                        <Star size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditDraft(toDraft(row));
                        setEditing(row.id);
                      }}
                      disabled={busy}
                      aria-label="この口座を直す"
                      title="この口座を直す"
                      className="hover:bg-[var(--color-bg-hover)]"
                      style={styles.iconButton}
                    >
                      <Landmark size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTarget(row)}
                      disabled={busy}
                      aria-label="この口座を削除"
                      title="この口座を削除"
                      className="hover:bg-[var(--color-bg-hover)]"
                      style={{ ...styles.iconButton, color: "var(--color-error)" }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            )
          )}
        </div>
      )}

      {editable &&
        (adding ? (
          <div style={styles.formCard}>
            <Fields draft={draft} onChange={setDraft} disabled={busy} />
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
                <X size={12} /> やめる
              </button>
              <button
                type="button"
                style={styles.btnPrimary}
                onClick={add}
                disabled={busy}
              >
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
            口座を追加
          </button>
        ))}

      <ConfirmDialog
        open={target !== null}
        title="口座を削除しますか？"
        message={`${target?.bank_name ?? ""} ${summarize(target ?? ({} as FinancialInfoRow))}\n過去の記録には残ります。`}
        confirmLabel="削除"
        danger
        onClose={() => setTarget(null)}
        onConfirm={async () => {
          if (!target) return { error: "対象が見つかりません" };
          const { error } = await deleteFinancialInfo(target.id);
          if (!error) {
            showToast({ type: "success", message: "削除しました" });
            setTarget(null);
            router.refresh();
          }
          return { error };
        }}
      />
    </div>
  );
}

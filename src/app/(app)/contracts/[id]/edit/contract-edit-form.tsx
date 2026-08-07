"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { updateContract, deleteContract } from "@/actions/contracts";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";
import { formContainerClass, fieldGridClass, formFooterClass } from "@/lib/layout";

type SelectOption = { value: string; label: string };

type ContractData = {
  /** 楽観ロック用。編集開始時点の値をそのまま保存時に送り返す */
  updated_at?: string | null;
  id: string;
  contract_name: string | null;
  /** 自動生成の契約名。読み取り専用で見せる */
  contract_display_name: string | null;
  contract_code: string | null;
  contract_method: string | null;
  contract_type_id: string | null;
  amount: number | null;
  counterparty_type: string | null;
  contract_content: string | null;
  sent_date: string | null;
  signback_date: string | null;
  execution_date: string | null;
  start_date: string | null;
  end_date: string | null;
  cancellation_date: string | null;
  auto_renewal: boolean | null;
  original_document_url: string | null;
  contract_url: string | null;
};

type Masters = {
  contractTypes: SelectOption[];
};

const styles = {
  container: formContainerClass,
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    marginBottom: "0.75rem",
  } as CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  } as CSSProperties,
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    color: "var(--color-text-title)",
    fontSize: "1rem",
    fontWeight: 600,
    margin: "0 0 1rem 0",
  } as CSSProperties,
  grid: fieldGridClass,
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
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
  } as CSSProperties,
  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-error)",
    color: "#fff",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1.25rem",
    border: "none",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.875rem",
    margin: "0.75rem 0 0 0",
  } as CSSProperties,
  helperText: {
    color: "var(--color-sumi500)",
    fontSize: "0.75rem",
    margin: "0.375rem 0 0 0",
  } as CSSProperties,
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  } as CSSProperties,
};

function onFocus(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) {
  e.currentTarget.style.borderColor = "var(--color-border-focus)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--color-focus-ring)";
}
function onBlur(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
) {
  e.currentTarget.style.borderColor = "var(--color-border-default)";
  e.currentTarget.style.boxShadow = "";
}

const CONTRACT_METHODS: SelectOption[] = [
  { value: "paper", label: "紙" },
  { value: "electronic", label: "電子" },
  { value: "verbal", label: "口頭" },
];

const COUNTERPARTY_TYPES: SelectOption[] = [
  { value: "company", label: "法人" },
  { value: "individual", label: "個人" },
];

export function ContractEditForm({
  contract,
  masters,
  isAdmin,
}: {
  contract: ContractData;
  masters: Masters;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState({
    contract_method: contract.contract_method ?? "",
    contract_type_id: contract.contract_type_id ?? "",
    contract_name: contract.contract_name ?? "",
    amount: contract.amount != null ? String(contract.amount) : "",
    counterparty_type: contract.counterparty_type ?? "",
    contract_content: contract.contract_content ?? "",
    sent_date: contract.sent_date ?? "",
    signback_date: contract.signback_date ?? "",
    execution_date: contract.execution_date ?? "",
    start_date: contract.start_date ?? "",
    end_date: contract.end_date ?? "",
    cancellation_date: contract.cancellation_date ?? "",
    auto_renewal: Boolean(contract.auto_renewal),
    original_document_url: contract.original_document_url ?? "",
    contract_url: contract.contract_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof typeof values>(
    key: K,
    value: (typeof values)[K]
  ) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const amountNum = values.amount.trim() === "" ? null : Number(values.amount);
    if (amountNum !== null && (Number.isNaN(amountNum) || amountNum < 0)) {
      setSaving(false);
      setError("金額は 0 以上の数値を入力してください");
      return;
    }

    const payload: Record<string, unknown> = {
      contract_method:
        values.contract_method === ""
          ? null
          : (values.contract_method as "paper" | "electronic" | "verbal"),
      contract_type_id: values.contract_type_id || null,
      contract_name: values.contract_name || null,
      amount: amountNum,
      counterparty_type:
        values.counterparty_type === ""
          ? null
          : (values.counterparty_type as "company" | "individual"),
      contract_content: values.contract_content || null,
      sent_date: values.sent_date || null,
      signback_date: values.signback_date || null,
      execution_date: values.execution_date || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      cancellation_date: values.cancellation_date || null,
      auto_renewal: values.auto_renewal,
      original_document_url: values.original_document_url || null,
      contract_url: values.contract_url || null,
      // 楽観ロック: 編集開始時点の updated_at を送り、他者更新があれば競合として弾く
      expected_updated_at: contract.updated_at ?? undefined,
    };

    const result = await updateContract(contract.id, payload);
    setSaving(false);
    if (result.error) {
      if (isFieldValidationError(result.error)) {
        setError(result.error);
      } else {
        showToast({ type: "error", message: result.error });
      }
      return;
    }
    showToast({ type: "success", message: "保存しました" });
    // router.refresh() は呼ばない（push が中断され遷移しなくなる）。
    // キャッシュ更新は Server Action 側の revalidatePath に任せる
    router.push(`/contracts/${contract.id}`);
  };

  const handleDelete = async () => {
    const result = await deleteContract(contract.id);
    if (result.error) {
      return { error: result.error };
    }
    showToast({ type: "success", message: "契約を削除しました" });
    router.push("/contracts");
    return { error: null };
  };

  return (
    <div className={styles.container}>
      <Link
        href={`/contracts/${contract.id}`}
        className="hover:bg-[var(--color-bg-hover)]"
        style={{
          ...styles.backLink,
          padding: "0.125rem 0.375rem",
          margin: "-0.125rem -0.375rem",
          borderRadius: "var(--radius-sm)",
          transition: "background-color 0.15s",
        }}
      >
        <ArrowLeft size={16} />
        契約詳細に戻る
      </Link>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>契約を編集</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 基本情報 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>基本情報</h2>
          <div className={styles.grid}>
            {/* 商談は別レコードへの紐づけなので詳細ページで直す */}
            {/*
              契約名は保存時に DB が組み立てる。入力欄にすると人が直せると
              誤解されるので、テキストで見せるだけにする（disabled な input は
              コピーしづらく、フォームの値とも誤解される）
            */}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>契約名</label>
              <p
                style={{
                  color: "var(--color-text-body)",
                  fontSize: "0.875rem",
                  margin: 0,
                  wordBreak: "break-all",
                }}
              >
                {contract.contract_display_name ?? "—"}
              </p>
              <p style={styles.helperText}>
                契約締結日_契約書名_契約種別_金額_契約ID から自動で作られます。保存すると入力に合わせて更新されます。
              </p>
            </div>
            <div>
              <label style={styles.label}>契約書名</label>
              <input
                type="text"
                style={styles.input}
                value={values.contract_name}
                onChange={(e) => set("contract_name", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>金額</label>
              <input
                type="number"
                min={0}
                style={styles.input}
                value={values.amount}
                onChange={(e) => set("amount", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約方法</label>
              <select
                style={styles.input}
                value={values.contract_method}
                onChange={(e) => set("contract_method", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {CONTRACT_METHODS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={styles.label}>契約種別</label>
              <select
                style={styles.input}
                value={values.contract_type_id}
                onChange={(e) => set("contract_type_id", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {masters.contractTypes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>契約内容</label>
              <textarea
                style={{ ...styles.input, minHeight: 120, resize: "vertical" }}
                maxLength={5000}
                value={values.contract_content}
                onChange={(e) => set("contract_content", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
          </div>
        </div>

        {/* 契約相手先 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>契約相手先</h2>
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>契約相手先区分</label>
              <select
                style={styles.input}
                value={values.counterparty_type}
                onChange={(e) => set("counterparty_type", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              >
                <option value="">-- 選択 --</option>
                {COUNTERPARTY_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {/* 相手先の紐づけ（事業者情報・連絡先・窓口担当）は詳細ページで直す */}
          </div>
        </div>

        {/* 日程 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>日程</h2>
          <div className={styles.grid}>
            <div>
              <label style={styles.label}>契約送付日</label>
              <input
                type="date"
                style={styles.input}
                value={values.sent_date}
                onChange={(e) => set("sent_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>サインバック日</label>
              <input
                type="date"
                style={styles.input}
                value={values.signback_date}
                onChange={(e) => set("signback_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約締結日</label>
              <input
                type="date"
                style={styles.input}
                value={values.execution_date}
                onChange={(e) => set("execution_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約開始日</label>
              <input
                type="date"
                style={styles.input}
                value={values.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>契約終了日</label>
              <input
                type="date"
                style={styles.input}
                value={values.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div>
              <label style={styles.label}>解約日</label>
              <input
                type="date"
                style={styles.input}
                value={values.cancellation_date}
                onChange={(e) => set("cancellation_date", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={styles.checkboxRow}>
              <input
                id="auto_renewal"
                type="checkbox"
                checked={values.auto_renewal}
                onChange={(e) => set("auto_renewal", e.target.checked)}
              />
              <label
                htmlFor="auto_renewal"
                style={{ ...styles.label, marginBottom: 0 }}
              >
                自動更新
              </label>
            </div>
          </div>
        </div>

        {/* URL / 登録者 */}
        <div style={styles.card}>
          <h2 style={styles.sectionTitle}>URL・登録者</h2>
          <div className={styles.grid}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>原本URL</label>
              <input
                type="url"
                style={styles.input}
                value={values.original_document_url}
                onChange={(e) =>
                  set("original_document_url", e.target.value)
                }
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={styles.label}>契約書URL</label>
              <input
                type="url"
                style={styles.input}
                value={values.contract_url}
                onChange={(e) => set("contract_url", e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>
            {/* 登録者は別レコードへの紐づけなので詳細ページで直す */}
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div className={formFooterClass}>
          <div>
            {isAdmin && (
              <button
                type="button"
                style={styles.btnDanger}
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 size={14} />
                削除
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Link
              href={`/contracts/${contract.id}`}
              style={{ ...styles.btnOutline, textDecoration: "none" }}
            >
              キャンセル
            </Link>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              <Save size={14} />
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        title="契約を削除"
        message={`「${contract.contract_display_name ?? contract.contract_name ?? "契約"}」を削除します。この操作は取り消せません。`}
        confirmLabel="削除する"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

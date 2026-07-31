"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import {
  addCompanyDomain,
  deleteCompanyDomain,
  setPrimaryCompanyDomain,
} from "@/actions/companies";
import { useToast } from "@/components/ui/toast";
import { isFieldValidationError } from "@/lib/errors";

export type CompanyDomainRow = {
  id: string;
  domain: string;
  is_primary: boolean;
};

const styles = {
  card: {
    backgroundColor: "#fff",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation-low)",
    padding: "1.25rem",
    marginBottom: "1.5rem",
  } as CSSProperties,
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "var(--color-text-title)",
    margin: "0 0 0.25rem 0",
  } as CSSProperties,
  hint: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    margin: "0 0 1rem 0",
    lineHeight: 1.6,
  } as CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: "0.375rem",
    marginBottom: "1rem",
  } as CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
  } as CSSProperties,
  domainText: {
    fontFamily: "monospace",
    fontSize: "0.875rem",
    color: "var(--color-text-list)",
  } as CSSProperties,
  primaryBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    borderRadius: "var(--radius-badge)",
    padding: "0.125rem 0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    backgroundColor: "rgba(122, 165, 146, 0.14)",
    color: "#4D7A65",
  } as CSSProperties,
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    background: "none",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.25rem 0.625rem",
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
    cursor: "pointer",
  } as CSSProperties,
  addRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "flex-start",
  } as CSSProperties,
  input: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-md)",
    fontSize: "0.875rem",
    outline: "none",
  } as CSSProperties,
  addButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as CSSProperties,
  error: {
    color: "var(--color-error)",
    fontSize: "0.8125rem",
    margin: "0.375rem 0 0 0",
  } as CSSProperties,
  empty: {
    fontSize: "0.8125rem",
    color: "var(--color-sumi500)",
    margin: "0 0 1rem 0",
  } as CSSProperties,
};

/**
 * 法人のメールドメイン管理。
 *
 * 名刺取込はここに登録されたドメインで所属法人を判定するため、
 * 法人情報の付随項目ではなく取込精度に直結する設定になる。
 *
 * 保存ボタンとは独立して即時反映する。ドメインは他法人との重複や
 * フリーメール判定を DB 側で弾くので、結果を待って一覧に反映する必要がある。
 */
export function CompanyDomainsSection({
  companyId,
  initialDomains,
}: {
  companyId: string;
  initialDomains: CompanyDomainRow[];
}) {
  const { showToast } = useToast();
  const [domains, setDomains] = useState<CompanyDomainRow[]>(
    [...initialDomains].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function sortDomains(rows: CompanyDomainRow[]): CompanyDomainRow[] {
    return [...rows].sort(
      (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.domain.localeCompare(b.domain)
    );
  }

  function handleAdd() {
    const value = input.trim();
    if (!value) {
      setError("ドメインを入力してください");
      return;
    }
    setError(null);
    startTransition(async () => {
      const { data, error: err } = await addCompanyDomain({
        company_id: companyId,
        domain: value,
        // 最初の 1 件は代表として登録する
        is_primary: domains.length === 0,
      });
      if (err || !data) {
        // 入力値に起因するもの（重複・フリーメール・形式不正）は入力欄の下に出す
        if (isFieldValidationError(err)) setError(err);
        else showToast({ type: "error", message: err ?? "ドメインの登録に失敗しました" });
        return;
      }
      setDomains((prev) =>
        sortDomains([
          ...prev.filter((d) => d.id !== data.id),
          { id: data.id, domain: data.domain, is_primary: data.is_primary },
        ])
      );
      setInput("");
      showToast({ type: "success", message: `${data.domain} を登録しました` });
    });
  }

  function handleSetPrimary(domain: string) {
    startTransition(async () => {
      const { data, error: err } = await setPrimaryCompanyDomain(companyId, domain);
      if (err || !data) {
        showToast({ type: "error", message: err ?? "代表ドメインの変更に失敗しました" });
        return;
      }
      setDomains((prev) =>
        sortDomains(prev.map((d) => ({ ...d, is_primary: d.id === data.id })))
      );
      showToast({ type: "success", message: `${data.domain} を代表ドメインにしました` });
    });
  }

  function handleDelete(row: CompanyDomainRow) {
    startTransition(async () => {
      const { error: err } = await deleteCompanyDomain(row.id);
      if (err) {
        showToast({ type: "error", message: err });
        return;
      }
      setDomains((prev) => prev.filter((d) => d.id !== row.id));
      showToast({ type: "success", message: `${row.domain} を削除しました` });
    });
  }

  return (
    <div style={styles.card}>
      <h2 style={styles.sectionTitle}>メールドメイン</h2>
      <p style={styles.hint}>
        名刺データの取込時に、メールアドレスのドメインでこの法人を判定します。
        事業部別・旧ドメインなど複数登録できます。
        フリーメール（gmail.com 等）は登録できません。
      </p>

      {domains.length === 0 ? (
        <p style={styles.empty}>まだ登録されていません。</p>
      ) : (
        <div style={styles.list}>
          {domains.map((d) => (
            <div key={d.id} style={styles.row}>
              <span style={styles.domainText}>{d.domain}</span>
              {d.is_primary && (
                <span style={styles.primaryBadge}>
                  <Star size={11} />
                  代表
                </span>
              )}
              <span style={{ marginLeft: "auto", display: "flex", gap: "0.375rem" }}>
                {!d.is_primary && (
                  <button
                    type="button"
                    style={styles.iconButton}
                    onClick={() => handleSetPrimary(d.domain)}
                    disabled={isPending}
                  >
                    <Star size={12} />
                    代表にする
                  </button>
                )}
                <button
                  type="button"
                  style={styles.iconButton}
                  onClick={() => handleDelete(d)}
                  disabled={isPending}
                >
                  <Trash2 size={12} />
                  削除
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={styles.addRow}>
        <input
          type="text"
          style={styles.input}
          placeholder="example.co.jp（メールアドレスや URL の貼り付けも可）"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // フォーム全体の送信ではなくドメイン追加として扱う
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          disabled={isPending}
        />
        <button
          type="button"
          style={styles.addButton}
          onClick={handleAdd}
          disabled={isPending}
        >
          <Plus size={14} />
          追加
        </button>
      </div>
      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

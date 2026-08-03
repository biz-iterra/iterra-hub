"use client";

import { useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { ArrowLeft, Check, X, Mail, Building2 } from "lucide-react";
import {
  approveEmailContactCandidate,
  ignoreEmailContactCandidate,
} from "@/actions/email-sync";
import { DetailSection } from "@/components/ui/DetailSection";
import { useToast } from "@/components/ui/toast";
import { detailContainerClass, entryRowClass } from "@/lib/layout";
import type { EmailCandidateWithCompany } from "@/types/relations";

type CandidateRow = EmailCandidateWithCompany;

const styles = {
  backLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-sumi600)",
    fontSize: "0.875rem",
    textDecoration: "none",
    marginBottom: "0.75rem",
  } as CSSProperties,
  title: {
    color: "var(--color-text-title)",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  } as CSSProperties,
  hint: {
    fontSize: "0.8125rem",
    color: "var(--color-sumi600)",
    lineHeight: 1.7,
    margin: "0.5rem 0 1.5rem 0",
  } as CSSProperties,
  email: {
    fontFamily: "monospace",
    fontSize: "0.875rem",
    color: "var(--color-text-body)",
    wordBreak: "break-all",
  } as CSSProperties,
  sub: {
    fontSize: "0.75rem",
    color: "var(--color-sumi500)",
    marginTop: "0.125rem",
  } as CSSProperties,
  input: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-input)",
    padding: "0.375rem 0.5rem",
    fontSize: "0.8125rem",
    width: "100%",
    outline: "none",
  } as CSSProperties,
  btn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 0.75rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as CSSProperties,
};

/**
 * メールに出てきたが連絡先として未登録のアドレス一覧。
 *
 * 自動で連絡先を作らないのは、配信メールやメーリングリストで
 * 連絡先が埋まるのを避けるため。ここで人が見て承認する。
 * 承認するとその瞬間に過去のやり取りが連絡先の履歴に並ぶ。
 */
export function CandidatesView({
  initialCandidates,
}: {
  initialCandidates: CandidateRow[];
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<CandidateRow[]>(initialCandidates);
  const [names, setNames] = useState<Record<string, { last: string; first: string }>>(
    () =>
      Object.fromEntries(
        initialCandidates.map((c) => [c.id, splitDisplayName(c.display_name)])
      )
  );
  const [isPending, startTransition] = useTransition();

  function setName(id: string, key: "last" | "first", value: string) {
    setNames((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  function handleApprove(row: CandidateRow) {
    const name = names[row.id] ?? { last: "", first: "" };
    if (!name.last.trim()) {
      showToast({ type: "error", message: "姓を入力してください" });
      return;
    }
    startTransition(async () => {
      const { error } = await approveEmailContactCandidate({
        candidateId: row.id,
        lastName: name.last,
        firstName: name.first,
        companyId: row.company?.id ?? null,
      });
      if (error) {
        showToast({ type: "error", message: error });
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast({
        type: "success",
        message: `${name.last} ${name.first} を連絡先に登録しました`.trim(),
      });
    });
  }

  function handleIgnore(row: CandidateRow) {
    startTransition(async () => {
      const { error } = await ignoreEmailContactCandidate(row.id);
      if (error) {
        showToast({ type: "error", message: error });
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      showToast({ type: "success", message: `${row.email_address} を対象外にしました` });
    });
  }

  return (
    <div className={detailContainerClass}>
      <Link href="/contacts" style={styles.backLink}>
        <ArrowLeft size={16} />
        連絡先一覧
      </Link>
      <h1 style={styles.title}>連絡先の候補</h1>
      <p style={styles.hint}>
        メールのやり取りに出てきたアドレスのうち、連絡先として未登録のものです。
        承認すると連絡先が作られ、そのアドレスとの過去のやり取りが履歴に並びます。
        配信メールなど登録の必要がないものは「対象外」にすると一覧から消えます。
      </p>

      <DetailSection
        title="未処理の候補"
        icon={Mail}
        action={
          <span style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}>
            {rows.length} 件
          </span>
        }
      >
        {rows.length === 0 ? (
          <p
            style={{
              color: "var(--color-sumi500)",
              fontSize: "0.875rem",
              margin: 0,
              padding: "1.5rem 0",
              textAlign: "center",
            }}
          >
            未処理の候補はありません
          </p>
        ) : (
          <div>
            {rows.map((row) => {
              const name = names[row.id] ?? { last: "", first: "" };
              return (
                <div key={row.id} className={entryRowClass}>
                  <div>
                    <div style={styles.email}>{row.email_address}</div>
                    <div style={styles.sub}>
                      {row.message_count} 通
                      {row.display_name ? ` ・ ${row.display_name}` : ""}
                      {row.company ? (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <Building2 size={11} />
                          {row.company.name}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <input
                      style={styles.input}
                      placeholder="姓"
                      value={name.last}
                      onChange={(e) => setName(row.id, "last", e.target.value)}
                      disabled={isPending}
                    />
                    <input
                      style={styles.input}
                      placeholder="名"
                      value={name.first}
                      onChange={(e) => setName(row.id, "first", e.target.value)}
                      disabled={isPending}
                    />
                  </div>

                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button
                      type="button"
                      style={{
                        ...styles.btn,
                        backgroundColor: "var(--color-terra)",
                        color: "#fff",
                        border: "none",
                      }}
                      onClick={() => handleApprove(row)}
                      disabled={isPending}
                    >
                      <Check size={13} />
                      登録
                    </button>
                    <button
                      type="button"
                      style={{
                        ...styles.btn,
                        backgroundColor: "transparent",
                        border: "1px solid var(--color-border-default)",
                        color: "var(--color-sumi600)",
                      }}
                      onClick={() => handleIgnore(row)}
                      disabled={isPending}
                    >
                      <X size={13} />
                      対象外
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

/**
 * ヘッダの表示名を姓名に割る。
 * 「山田 太郎」「Taro Yamada」のどちらも来るので、区切りがあれば
 * 先頭を姓として扱い、無ければ全体を姓に入れて人が直せるようにする。
 */
function splitDisplayName(displayName: string | null): { last: string; first: string } {
  const name = (displayName ?? "").trim();
  if (!name) return { last: "", first: "" };
  const parts = name.split(/[\s　]+/);
  if (parts.length === 1) return { last: parts[0], first: "" };
  return { last: parts[0], first: parts.slice(1).join(" ") };
}

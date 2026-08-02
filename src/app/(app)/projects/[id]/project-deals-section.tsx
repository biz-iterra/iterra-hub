"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Handshake, Plus, X } from "lucide-react";

import { addDealProject, removeDealProject } from "@/actions/projects";
import { DetailSection } from "@/components/ui/DetailSection";
import { PipelineBadge, StageBadge } from "@/components/ui/badges";
import { useToast } from "@/components/ui/toast";

/**
 * プロジェクトに紐づく商談。
 *
 * 商談とプロジェクトは多対多で、どちらが親とも言えないため両側から足し外しできる
 * （商談側は詳細ページの「プロジェクト」）。列が多いので右カラムのリストではなく
 * 本文側のテーブルで出す。
 */

export type LinkedDeal = {
  id: string;
  deal_code: string | null;
  name: string;
  pipeline_name: string | null;
  stage_name: string | null;
  stage_color: string | null;
  stage_sort_order: number | null;
  amount: number | null;
  account_name: string | null;
};

export type DealOption = { value: string; label: string };

const cell = {
  borderBottom: "1px solid var(--color-border-default)",
  padding: "0.5rem",
  fontSize: "0.875rem",
} as const;

const th = {
  backgroundColor: "var(--color-sumi50)",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--color-sumi700)",
  padding: "0.5rem",
  textAlign: "left" as const,
};

const iconButton = {
  display: "inline-flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  width: "1.25rem",
  height: "1.25rem",
  border: "none",
  backgroundColor: "transparent",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-sumi500)",
  cursor: "pointer",
  padding: 0,
};

export function ProjectDealsSection({
  projectId,
  deals,
  options,
  editable = true,
}: {
  projectId: string;
  deals: LinkedDeal[];
  /** 足せる商談。既に紐づいているものは呼び出し側で除いておく */
  options: DealOption[];
  editable?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const totalAmount = deals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

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
    if (!draft) {
      showToast({ type: "error", message: "商談を選んでください" });
      return;
    }
    const ok = await run(async () => {
      const { error } = await addDealProject({
        deal_id: draft,
        project_id: projectId,
      });
      return { error };
    });
    if (ok) {
      setAdding(false);
      setDraft("");
    }
  }

  return (
    <DetailSection
      title={`紐づく商談（${deals.length}件）`}
      icon={Handshake}
      action={
        <span style={{ fontSize: "0.75rem", color: "var(--color-sumi600)" }}>
          合計金額: ¥{totalAmount.toLocaleString()}
        </span>
      }
    >
      {deals.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["コード", "商談名", "パイプライン", "ステージ", "金額", "取引先"].map(
                  (h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  )
                )}
                {editable && <th style={{ ...th, width: "2.5rem" }} aria-label="操作" />}
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id}>
                  <td style={cell}>
                    <Link
                      href={`/deals/${d.id}`}
                      className="hover:bg-[var(--color-bg-hover)]"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        color: "var(--color-terra)",
                        textDecoration: "none",
                        padding: "0.125rem 0.375rem",
                        margin: "-0.125rem -0.375rem",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.875rem",
                      }}
                    >
                      {d.deal_code}
                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                  <td style={cell}>{d.name}</td>
                  <td style={cell}>
                    <PipelineBadge name={d.pipeline_name} />
                  </td>
                  <td style={cell}>
                    <StageBadge
                      name={d.stage_name}
                      color={d.stage_color}
                      sortOrder={d.stage_sort_order ?? undefined}
                    />
                  </td>
                  <td style={cell}>
                    {d.amount != null ? `¥${d.amount.toLocaleString()}` : "-"}
                  </td>
                  <td style={cell}>{d.account_name ?? "-"}</td>
                  {editable && (
                    <td style={cell}>
                      <button
                        type="button"
                        onClick={() =>
                          run(async () => {
                            const { error } = await removeDealProject(d.id, projectId);
                            return { error };
                          })
                        }
                        disabled={busy}
                        aria-label={`${d.name}との紐づけを外す`}
                        title="紐づけを外す"
                        className="hover:bg-[var(--color-bg-hover)]"
                        style={iconButton}
                      >
                        <X size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>
          まだ商談が紐づいていません
        </p>
      )}

      {editable &&
        (adding ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              marginTop: "0.75rem",
            }}
          >
            <select
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              autoFocus
              style={{
                flex: 1,
                minWidth: 0,
                border: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-input)",
                padding: "0.375rem 0.5rem",
                fontSize: "0.875rem",
                backgroundColor: "#fff",
                outline: "none",
                fontFamily: "inherit",
              }}
            >
              <option value="">-- 選択 --</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={add}
              disabled={busy}
              aria-label="追加"
              title="追加"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1.75rem",
                height: "1.75rem",
                border: "none",
                backgroundColor: "var(--color-terra)",
                color: "#fff",
                borderRadius: "var(--radius-button)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              disabled={busy}
              aria-label="やめる"
              title="やめる"
              className="hover:bg-[var(--color-bg-hover)]"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "1.75rem",
                height: "1.75rem",
                border: "1px solid var(--color-border-default)",
                backgroundColor: "transparent",
                color: "var(--color-sumi600)",
                borderRadius: "var(--radius-button)",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="hover:bg-[var(--color-bg-hover)]"
            style={{
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
            }}
          >
            <Plus size={12} />
            追加
          </button>
        ))}
    </DetailSection>
  );
}

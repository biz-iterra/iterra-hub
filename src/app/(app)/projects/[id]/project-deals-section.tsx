"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Handshake, Plus, X, ArrowUpRight } from "lucide-react";
import { getDeals } from "@/actions/deals";
import { addDealProject, removeDealProject } from "@/actions/projects";
import { PipelineBadge, StageBadge } from "@/components/ui/badges";

type LinkedDeal = {
  id: string;
  deal_id: string;
  deal: {
    id: string;
    deal_code: string;
    name: string;
    amount: number | null;
    account: { id: string; name: string; account_code: string | null } | null;
    pipeline_type: { id: string; name: string } | null;
    deal_stage: { id: string; name: string; sort_order?: number } | null;
    deal_status: { id: string; name: string; sort_order?: number } | null;
  } | null;
};

export function ProjectDealsSection({
  projectId,
  initialDealProjects,
}: {
  projectId: string;
  initialDealProjects: LinkedDeal[];
}) {
  const [linked, setLinked] = useState<LinkedDeal[]>(
    initialDealProjects.filter((d) => d.deal)
  );
  const [allDeals, setAllDeals] = useState<
    { id: string; deal_code: string; name: string; account_name: string | null }[]
  >([]);
  const [selectedId, setSelectedId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await getDeals({ perPage: 200 });
      if (res.data?.rows) {
        setAllDeals(
          res.data.rows.map((d) => ({
            id: d.id,
            deal_code: d.deal_code,
            name: d.name,
            account_name: d.account?.name ?? null,
          }))
        );
      }
    })();
  }, []);

  const linkedIds = new Set(linked.map((d) => d.deal?.id).filter(Boolean));
  const availableDeals = allDeals.filter((d) => !linkedIds.has(d.id));

  const totalAmount = linked.reduce((sum, l) => sum + (l.deal?.amount ?? 0), 0);

  const handleAdd = () => {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const result = await addDealProject({ deal_id: selectedId, project_id: projectId });
      if (result.error) {
        setError(result.error);
        return;
      }
      const d = allDeals.find((x) => x.id === selectedId);
      if (d && result.data) {
        setLinked((prev) => [
          ...prev,
          {
            id: (result.data as { id: string }).id,
            deal_id: d.id,
            deal: {
              id: d.id,
              deal_code: d.deal_code,
              name: d.name,
              amount: null,
              account: d.account_name
                ? { id: "", name: d.account_name, account_code: null }
                : null,
              pipeline_type: null,
              deal_stage: null,
              deal_status: null,
            },
          },
        ]);
      }
      setSelectedId("");
    });
  };

  const handleRemove = (dealId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await removeDealProject(dealId, projectId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLinked((prev) => prev.filter((l) => l.deal?.id !== dealId));
    });
  };

  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--elevation-low)",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Handshake size={18} style={{ color: "var(--color-text-title)" }} />
          <h2
            style={{
              color: "var(--color-text-title)",
              fontSize: "1rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            紐づくディール（{linked.length}件）
          </h2>
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--color-sumi600)" }}>
          合計金額: ¥{totalAmount.toLocaleString()}
        </span>
      </div>

      {/* 追加フォーム */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            flex: 1,
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-input)",
            padding: "0.375rem 0.5rem",
            fontSize: "0.875rem",
            backgroundColor: "#fff",
            outline: "none",
          }}
        >
          <option value="">-- 紐づけるディールを選択 --</option>
          {availableDeals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deal_code} {d.name}
              {d.account_name ? ` / ${d.account_name}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!selectedId || isPending}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            backgroundColor: "var(--color-terra)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-button)",
            padding: "0.375rem 0.75rem",
            cursor: "pointer",
            fontSize: "0.75rem",
            fontWeight: 500,
            opacity: !selectedId || isPending ? 0.5 : 1,
          }}
        >
          <Plus size={12} />
          紐づける
        </button>
      </div>

      {error && (
        <p
          style={{
            color: "var(--color-error)",
            fontSize: "0.75rem",
            margin: "0 0 0.5rem 0",
          }}
        >
          {error}
        </p>
      )}

      {/* ディール一覧 */}
      {linked.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["コード", "ディール名", "パイプライン", "ステージ", "金額", "アカウント", ""].map(
                (h) => (
                  <th
                    key={h}
                    style={{
                      backgroundColor: "var(--color-sumi50)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--color-sumi700)",
                      padding: "0.5rem",
                      textAlign: h === "" ? "right" : "left",
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {linked.map((l) =>
              l.deal ? (
                <tr key={l.id}>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      padding: "0.5rem",
                    }}
                  >
                    <Link
                      href={`/deals/${l.deal.id}`}
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
                      {l.deal.deal_code}
                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      padding: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    {l.deal.name}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      padding: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <PipelineBadge name={l.deal.pipeline_type?.name} />
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      padding: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    <StageBadge name={l.deal.deal_stage?.name} sortOrder={l.deal.deal_stage?.sort_order} />
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      padding: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    {l.deal.amount != null ? `¥${l.deal.amount.toLocaleString()}` : "-"}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      padding: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    {l.deal.account?.name ?? "-"}
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                      padding: "0.5rem",
                      textAlign: "right",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleRemove(l.deal!.id)}
                      disabled={isPending}
                      style={{
                        backgroundColor: "transparent",
                        color: "var(--color-error)",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <X size={12} />
                      解除
                    </button>
                  </td>
                </tr>
              ) : null
            )}
          </tbody>
        </table>
        </div>
      ) : (
        <p style={{ color: "var(--color-sumi400)", fontSize: "0.875rem", margin: 0 }}>
          まだディールが紐づいていません
        </p>
      )}
    </div>
  );
}

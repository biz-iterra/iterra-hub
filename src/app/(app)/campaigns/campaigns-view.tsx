"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, Plus, ArrowUpRight } from "lucide-react";
import { getCampaigns } from "@/actions/campaigns";

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  generation: "獲得",
  nurturing: "育成",
  qualification: "選定",
};

const CAMPAIGN_TYPE_STYLES: Record<string, React.CSSProperties> = {
  generation: { backgroundColor: "rgba(215, 119, 93, 0.15)", color: "#A34E35" },
  nurturing: { backgroundColor: "rgba(122, 165, 146, 0.15)", color: "#4D7A65" },
  qualification: { backgroundColor: "rgba(229, 196, 127, 0.25)", color: "#8A6D1E" },
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  active: "実施中",
  paused: "一時停止",
  completed: "完了",
  cancelled: "中止",
};

const CAMPAIGN_STATUS_STYLES: Record<string, React.CSSProperties> = {
  draft: { backgroundColor: "var(--color-sumi100)", color: "var(--color-sumi600)" },
  active: { backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#047857" },
  paused: { backgroundColor: "rgba(245, 158, 11, 0.14)", color: "#B45309" },
  completed: { backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#1E40AF" },
  cancelled: { backgroundColor: "rgba(239, 68, 68, 0.12)", color: "#B91C1C" },
};

export function CampaignsView({
  initialData,
  currentUserRole,
}: {
  initialData: { items: any[]; count: number } | null;
  currentUserRole: string;
}) {
  const [data, setData] = useState(initialData);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [isPending, startTransition] = useTransition();

  const isManagerOrAbove =
    currentUserRole === "manager" || currentUserRole === "admin";

  function handleFilter(overrides: Record<string, string | undefined>) {
    startTransition(async () => {
      const resolvedType = overrides.type !== undefined ? overrides.type : typeFilter;
      const resolvedStatus = overrides.status !== undefined ? overrides.status : statusFilter;
      const resolvedKeyword = overrides.keyword !== undefined ? overrides.keyword : keyword;
      const params = {
        type: (resolvedType || undefined) as "generation" | "nurturing" | "qualification" | undefined,
        status: (resolvedStatus || undefined) as "draft" | "active" | "paused" | "completed" | "cancelled" | undefined,
        keyword: resolvedKeyword || undefined,
        perPage: 50,
        page: 1,
      };
      const { data: result } = await getCampaigns(params);
      setData(result);
    });
  }

  const items = data?.items ?? [];
  const selectStyle: React.CSSProperties = {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    backgroundColor: "#fff",
    color: "var(--color-text-title)",
    fontSize: "0.8125rem",
    padding: "0.4rem 0.75rem",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-title)" }}>
          キャンペーン
        </h1>
        {isManagerOrAbove && (
          <Link
            href="/campaigns/new"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{
              backgroundColor: "var(--color-terra)",
              borderRadius: "var(--radius-button)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-terra-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "var(--color-terra)")
            }
          >
            <Plus size={16} />
            新規作成
          </Link>
        )}
      </div>

      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          style={selectStyle}
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            handleFilter({ type: e.target.value || undefined });
          }}
        >
          <option value="">全種別</option>
          <option value="generation">獲得</option>
          <option value="nurturing">育成</option>
          <option value="qualification">選定</option>
        </select>

        <select
          style={selectStyle}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            handleFilter({ status: e.target.value || undefined });
          }}
        >
          <option value="">全ステータス</option>
          <option value="draft">下書き</option>
          <option value="active">実施中</option>
          <option value="paused">一時停止</option>
          <option value="completed">完了</option>
          <option value="cancelled">中止</option>
        </select>

        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-sumi400)" }} />
          <input
            type="text"
            placeholder="キャンペーン名で検索..."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              handleFilter({ keyword: e.target.value || undefined });
            }}
            className="w-full pl-9 pr-3 py-[0.4rem] text-sm outline-none bg-white"
            style={{
              border: "1px solid var(--color-border-default)",
              borderRadius: "var(--radius-button)",
              color: "var(--color-text-title)",
              fontSize: "0.8125rem",
            }}
          />
        </div>
        {isPending && (
          <span className="text-xs" style={{ color: "var(--color-sumi500)" }}>
            読み込み中...
          </span>
        )}
      </div>

      {/* テーブル */}
      {items.length === 0 ? (
        <div
          className="p-10 text-center text-sm"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
            color: "var(--color-sumi500)",
          }}
        >
          キャンペーンが見つかりません
        </div>
      ) : (
        <div
          className="overflow-x-auto no-scrollbar"
          style={{
            backgroundColor: "#fff",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--elevation-low)",
          }}
        >
          <table className="w-full text-sm" style={{ tableLayout: "auto" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--color-sumi50)" }}>
                {["キャンペーン名", "種別", "期間", "ステータス", "作成日"].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left font-semibold text-xs whitespace-nowrap"
                    style={{ color: "var(--color-sumi600)" }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((campaign: any) => (
                <tr
                  key={campaign.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid var(--color-border-default)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  onClick={() => (window.location.href = `/campaigns/${campaign.id}`)}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--color-text-title)", fontWeight: 500, textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {campaign.name}
                      <ArrowUpRight size={13} style={{ color: "var(--color-sumi400)" }} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      style={{
                        ...(CAMPAIGN_TYPE_STYLES[campaign.type] ?? {}),
                        borderRadius: "var(--radius-badge)",
                        padding: "0.125rem 0.5rem",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                      }}
                    >
                      {CAMPAIGN_TYPE_LABELS[campaign.type] ?? campaign.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-sumi600)" }}>
                    {campaign.start_date
                      ? new Date(campaign.start_date).toLocaleDateString("ja-JP")
                      : "—"}
                    {" 〜 "}
                    {campaign.end_date
                      ? new Date(campaign.end_date).toLocaleDateString("ja-JP")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      style={{
                        ...(CAMPAIGN_STATUS_STYLES[campaign.status] ?? {}),
                        borderRadius: "var(--radius-badge)",
                        padding: "0.125rem 0.5rem",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                      }}
                    >
                      {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-sumi500)" }}>
                    {campaign.created_at
                      ? new Date(campaign.created_at).toLocaleDateString("ja-JP")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <p className="mt-3 text-xs" style={{ color: "var(--color-sumi500)" }}>
          {data.count} 件中 {items.length} 件を表示
        </p>
      )}
    </div>
  );
}

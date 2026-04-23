"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCampaigns } from "@/actions/campaigns";
import { CampaignTypeBadge, CampaignStatusBadge } from "@/components/ui/badges";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function CampaignsView({
  initialData,
  currentUserRole,
}: {
  initialData: { rows: any[]; total: number } | null;
  currentUserRole: string;
}) {
  const [data, setData] = useState(initialData);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const isManagerOrAbove =
    currentUserRole === "manager" || currentUserRole === "admin";

  function handleFilter(overrides: Record<string, string | undefined>) {
    setPage(1);
    startTransition(async () => {
      const resolvedType = overrides.type !== undefined ? overrides.type : typeFilter;
      const resolvedStatus = overrides.status !== undefined ? overrides.status : statusFilter;
      const resolvedKeyword = overrides.keyword !== undefined ? overrides.keyword : keyword;
      const params = {
        type: (resolvedType || undefined) as "generation" | "nurturing" | "qualification" | undefined,
        status: (resolvedStatus || undefined) as "draft" | "active" | "paused" | "completed" | "cancelled" | undefined,
        keyword: resolvedKeyword || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: 1,
      };
      const { data: result } = await getCampaigns(params);
      setData(result);
    });
  }

  function handleClear() {
    setTypeFilter("");
    setStatusFilter("");
    setKeyword("");
    setPage(1);
    startTransition(async () => {
      const { data: result } = await getCampaigns({ perPage: DEFAULT_PAGE_SIZE, page: 1 });
      setData(result);
    });
  }

  function handlePageChange(next: number) {
    setPage(next);
    startTransition(async () => {
      const params = {
        type: (typeFilter || undefined) as "generation" | "nurturing" | "qualification" | undefined,
        status: (statusFilter || undefined) as "draft" | "active" | "paused" | "completed" | "cancelled" | undefined,
        keyword: keyword || undefined,
        perPage: DEFAULT_PAGE_SIZE,
        page: next,
      };
      const { data: result } = await getCampaigns(params);
      setData(result);
    });
  }

  const items = data?.rows ?? [];

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
      <FilterGroup className="mb-4">
        <FilterSelect
          label="種別"
          value={typeFilter}
          options={[
            { value: "generation", label: "獲得" },
            { value: "nurturing", label: "育成" },
            { value: "qualification", label: "選定" },
          ]}
          onChange={(v) => {
            setTypeFilter(v);
            handleFilter({ type: v });
          }}
        />
        <FilterSelect
          label="ステータス"
          value={statusFilter}
          options={[
            { value: "draft", label: "下書き" },
            { value: "active", label: "実施中" },
            { value: "paused", label: "一時停止" },
            { value: "completed", label: "完了" },
            { value: "cancelled", label: "中止" },
          ]}
          onChange={(v) => {
            setStatusFilter(v);
            handleFilter({ status: v });
          }}
        />
        <SearchInput
          value={keyword}
          placeholder="キャンペーン名で検索..."
          onChange={(v) => {
            setKeyword(v);
            handleFilter({ keyword: v });
          }}
        />
        <FilterClearButton onClear={handleClear} />
        {isPending && (
          <span
            className="text-xs"
            style={{ color: "var(--color-sumi500)", alignSelf: "flex-end", paddingBottom: "0.45rem" }}
          >
            読み込み中...
          </span>
        )}
      </FilterGroup>

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
                {["キャンペーン名", "ステータス", "種別", "期間", "最終更新日"].map((label) => (
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
                  {/* キャンペーン名 */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      style={{ color: "var(--color-text-list)", fontWeight: 500, textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {campaign.name}
                    </Link>
                  </td>
                  {/* ステータス */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <CampaignStatusBadge status={campaign.status} />
                  </td>
                  {/* 種別 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <CampaignTypeBadge type={campaign.type} />
                  </td>
                  {/* 期間 */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-text-list)" }}>
                    {campaign.start_date
                      ? new Date(campaign.start_date).toLocaleDateString("ja-JP")
                      : "—"}
                    {" 〜 "}
                    {campaign.end_date
                      ? new Date(campaign.end_date).toLocaleDateString("ja-JP")
                      : "—"}
                  </td>
                  {/* 最終更新日 */}
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--color-text-list)" }}>
                    {formatDateTime(campaign.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* ページネーション */}
      <Pagination
        page={page}
        totalCount={data?.total ?? 0}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

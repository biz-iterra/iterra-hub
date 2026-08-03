"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CreditCard } from "lucide-react";

import { getBusinessCards } from "@/actions/business-cards";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import type { BusinessCardListRow, Paged } from "@/types/relations";

type CardsData = Paged<BusinessCardListRow> | null;
type ReferrerFilter = "" | "with" | "without";

const REFERRER_OPTIONS = [
  { value: "with", label: "紹介者あり" },
  { value: "without", label: "紹介者なし" },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  return `${y}/${m}/${d}`;
}

function personName(
  p: { last_name: string; first_name: string | null } | null
): string {
  if (!p) return "—";
  return [p.last_name, p.first_name].filter(Boolean).join(" ");
}

/**
 * 名刺の一覧。
 *
 * 名刺は連絡先詳細でしか見えず、紹介者の確認・修正に連絡先を 1 件ずつ
 * 開く必要があった。横断で見て、紹介者が未設定のものを洗い出すための画面。
 *
 * 編集は連絡先詳細で行う（名刺は連絡先に属するもので、単独では扱わない）。
 * 行をクリックするとその連絡先へ移る。
 */
export function BusinessCardsView({ initialData }: { initialData: CardsData }) {
  const [data, setData] = useState<CardsData>(initialData);
  const [keyword, setKeyword] = useState("");
  const [referrer, setReferrer] = useState<ReferrerFilter>("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function reload(next: {
    search?: string;
    referrer?: ReferrerFilter;
    page?: number;
  }) {
    const params = {
      search: (next.search ?? keyword) || undefined,
      referrer: (next.referrer ?? referrer) || undefined,
      page: next.page ?? 1,
      perPage: DEFAULT_PAGE_SIZE,
    };
    startTransition(async () => {
      const { data: result } = await getBusinessCards(params);
      setData(result);
    });
  }

  const items = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <Link
        href="/contacts"
        className="hover:bg-[var(--color-bg-hover)]"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.25rem",
          color: "var(--color-sumi600)",
          fontSize: "0.875rem",
          textDecoration: "none",
          borderRadius: "var(--radius-sm)",
          padding: "0.125rem 0.375rem",
          margin: "0 0 0.75rem -0.375rem",
        }}
      >
        <ArrowLeft size={14} />
        連絡先
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          名刺
        </h1>
        <span style={{ fontSize: "0.8125rem", color: "var(--color-sumi500)" }}>
          {total.toLocaleString()} 枚
        </span>
      </div>

      <FilterGroup className="mb-4">
        <FilterSelect
          label="紹介者"
          value={referrer}
          options={REFERRER_OPTIONS}
          onChange={(v) => {
            setReferrer(v as ReferrerFilter);
            setPage(1);
            reload({ referrer: v as ReferrerFilter, page: 1 });
          }}
        />
        <SearchInput
          value={keyword}
          placeholder="連絡先の氏名で検索..."
          onChange={(v) => {
            setKeyword(v);
            setPage(1);
            reload({ search: v, page: 1 });
          }}
        />
        <FilterClearButton
          onClear={() => {
            setKeyword("");
            setReferrer("");
            setPage(1);
            reload({ search: "", referrer: "", page: 1 });
          }}
        />
        {isPending && (
          <span
            className="text-xs"
            style={{
              color: "var(--color-sumi500)",
              alignSelf: "flex-end",
              paddingBottom: "0.45rem",
            }}
          >
            読み込み中...
          </span>
        )}
      </FilterGroup>

      {/* 一覧（md 未満はカード） */}
      <DataTable
        items={items}
        getKey={(card) => card.id}
        getHref={(card) => (card.contact ? `/contacts/${card.contact.id}` : "")}
        emptyIcon={CreditCard}
        emptyMessage="名刺が見つかりません"
        fixedLayout
        columns={[
          {
            label: "連絡先",
            card: "title",
            className: "w-[25%]",
            render: (card) => (
              <>
                <span style={{ color: "var(--color-text-title)" }}>
                  {personName(card.contact)}
                </span>
                {card.is_primary && (
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      backgroundColor: "var(--color-terra)",
                      color: "#fff",
                      borderRadius: "var(--radius-badge)",
                      padding: "0.0625rem 0.375rem",
                      fontSize: "0.625rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    現在の所属
                  </span>
                )}
              </>
            ),
          },
          {
            /* 部署・役職は長くなりがちで、放っておくと他の列を潰す。
               比率を決めて、あふれる分は省略する（カードでは折り返す） */
            label: "所属",
            className: "w-[20%] overflow-hidden text-ellipsis whitespace-nowrap",
            render: (card) => card.company?.name ?? card.company_name_raw ?? "—",
          },
          {
            label: "部署・役職",
            className: "w-[20%] overflow-hidden text-ellipsis whitespace-nowrap",
            render: (card) =>
              [card.department, card.job_title].filter(Boolean).join(" ・ ") || "—",
          },
          {
            label: "紹介者",
            className: "w-[25%] overflow-hidden text-ellipsis whitespace-nowrap",
            render: (card) =>
              card.referrer ? (
                <span style={{ color: "var(--color-text-list)" }}>
                  {personName(card.referrer)}
                </span>
              ) : card.referral_memo ? (
                <span style={{ color: "var(--color-sumi600)" }}>
                  {card.referral_memo}
                </span>
              ) : (
                <span style={{ color: "var(--color-sumi400)" }}>—</span>
              ),
          },
          {
            label: "登録日",
            className: "w-[10%] whitespace-nowrap",
            render: (card) => formatDate(card.source_registered_on),
          },
        ]}
      />

      <Pagination
        page={page}
        totalCount={total}
        pageSize={DEFAULT_PAGE_SIZE}
        onPageChange={(next) => {
          setPage(next);
          reload({ page: next });
        }}
      />
    </div>
  );
}

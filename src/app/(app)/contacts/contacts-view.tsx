"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Mail, Phone } from "lucide-react";
import { getContacts } from "@/actions/contacts";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { ContactTypeBadge, StatusBadge } from "@/components/ui/badges";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ContactEmail {
  id: string;
  email: string;
  label: string | null;
  is_primary: boolean;
}

interface ContactPhone {
  id: string;
  phone: string;
  label: string | null;
  is_primary: boolean;
}

interface ContactRow {
  id: string;
  contact_code: string;
  last_name: string;
  first_name: string;
  contact_type: string;
  updated_at: string | null;
  company: { id: string; name: string } | null;
  contact_status: { id: string; name: string } | null;
  owner: { id: string; full_name: string } | null;
  contact_emails: ContactEmail[];
  contact_phones: ContactPhone[];
}

type ContactStatus = { id: string; name: string };
type CrmUser = { id: string; full_name: string; role: string };

interface Props {
  initialData: { rows: unknown[]; total: number } | null;
  statuses: ContactStatus[];
  users: CrmUser[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function getPrimaryEmail(emails: ContactEmail[]): string {
  if (!emails || emails.length === 0) return "—";
  const primary = emails.find((e) => e.is_primary);
  return (primary ?? emails[0]).email;
}

function getPrimaryPhone(phones: ContactPhone[]): string {
  if (!phones || phones.length === 0) return "—";
  const primary = phones.find((p) => p.is_primary);
  return (primary ?? phones[0]).phone;
}

const CONTACT_TYPE_OPTIONS = [
  { value: "corporate_rep", label: "法人代表" },
  { value: "employee", label: "従業員" },
  { value: "individual", label: "個人" },
  { value: "other", label: "その他" },
];

const PER_PAGE = DEFAULT_PAGE_SIZE;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function ContactsView({ initialData, statuses, users }: Props) {
  const [data, setData] = useState(initialData);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function handleFilter(
    key: string,
    value: string,
    setter: (v: string) => void
  ) {
    setter(value);
    setPage(1);
    startTransition(async () => {
      const { data: result } = await getContacts({
        statusId:    key === "statusId"    ? value || undefined : statusFilter || undefined,
        contactType: key === "contactType" ? value || undefined : typeFilter   || undefined,
        ownerUserId: key === "ownerUserId" ? value || undefined : ownerFilter  || undefined,
        search:      key === "search"      ? value || undefined : keyword      || undefined,
        perPage: PER_PAGE,
        page: 1,
      });
      setData(result);
    });
  }

  function handleClear() {
    setStatusFilter("");
    setTypeFilter("");
    setOwnerFilter("");
    setKeyword("");
    setPage(1);
    startTransition(async () => {
      const { data: result } = await getContacts({ perPage: PER_PAGE, page: 1 });
      setData(result);
    });
  }

  function handlePageChange(next: number) {
    setPage(next);
    startTransition(async () => {
      const { data: result } = await getContacts({
        statusId: statusFilter || undefined,
        contactType: typeFilter || undefined,
        ownerUserId: ownerFilter || undefined,
        search: keyword || undefined,
        perPage: PER_PAGE,
        page: next,
      });
      setData(result);
    });
  }

  const items = (data?.rows ?? []) as ContactRow[];
  const totalCount = data?.total ?? 0;

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          連絡先
        </h1>
        <Link
          href="/contacts/new"
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
      </div>

      {/* フィルター行 */}
      <FilterGroup className="mb-4">
        <FilterSelect
          label="ステータス"
          value={statusFilter}
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => handleFilter("statusId", v, setStatusFilter)}
        />
        <FilterSelect
          label="種別"
          value={typeFilter}
          options={CONTACT_TYPE_OPTIONS}
          onChange={(v) => handleFilter("contactType", v, setTypeFilter)}
        />
        <FilterSelect
          label="担当者"
          value={ownerFilter}
          options={users.map((u) => ({ value: u.id, label: u.full_name }))}
          onChange={(v) => handleFilter("ownerUserId", v, setOwnerFilter)}
        />
        <SearchInput
          value={keyword}
          placeholder="氏名で検索..."
          onChange={(v) => handleFilter("search", v, setKeyword)}
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
          連絡先が見つかりません
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
                {[
                  "氏名",
                  "ステータス",
                  "種別",
                  "所属",
                  "メール",
                  "電話",
                  "担当者",
                  "最終更新日",
                ].map((label) => (
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
              {items.map((row) => (
                <tr
                  key={row.id}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid var(--color-border-default)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                  onClick={() => (window.location.href = `/contacts/${row.id}`)}
                >
                  {/* 氏名 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/contacts/${row.id}`}
                      className="font-medium"
                      style={{ color: "var(--color-text-list)" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.last_name} {row.first_name}
                    </Link>
                  </td>
                  {/* ステータス */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge
                      name={row.contact_status?.name}
                      seed={row.contact_status?.id}
                    />
                  </td>
                  {/* 種別 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <ContactTypeBadge type={row.contact_type} />
                  </td>
                  {/* 所属 */}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {row.company?.name ?? "—"}
                  </td>
                  {/* メール */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        color: "var(--color-text-list)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <Mail size={14} style={{ flexShrink: 0 }} />
                      {getPrimaryEmail(row.contact_emails)}
                    </span>
                  </td>
                  {/* 電話 */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        color: "var(--color-text-list)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      <Phone size={14} style={{ flexShrink: 0 }} />
                      {getPrimaryPhone(row.contact_phones)}
                    </span>
                  </td>
                  {/* 担当者 */}
                  <td
                    className="px-4 py-3 whitespace-nowrap"
                    style={{ color: "var(--color-text-list)", fontSize: "0.8125rem" }}
                  >
                    {row.owner?.full_name ?? "—"}
                  </td>
                  {/* 最終更新日 */}
                  <td
                    className="px-4 py-3 text-xs whitespace-nowrap"
                    style={{ color: "var(--color-text-list)" }}
                  >
                    {formatDateTime(row.updated_at)}
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
        totalCount={totalCount}
        pageSize={PER_PAGE}
        onPageChange={handlePageChange}
      />
    </div>
  );
}

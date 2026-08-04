"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Link2Off,
  Plus,
  XCircle,
} from "lucide-react";
import {
  confirmFreeePartnerLink,
  excludeFreeePartner,
  getFreeePartnerCandidates,
  listFreeePartners,
  registerFreeePartnerCompany,
  unlinkFreeePartner,
} from "@/actions/freee";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { tableScrollClass } from "@/lib/layout";
import type { FreeePartnerCandidate, FreeePartnerListItem } from "@/types/relations";

const PER_PAGE = DEFAULT_PAGE_SIZE;

const LINK_STATUS_OPTIONS = [
  { value: "unlinked", label: "未紐付け" },
  { value: "auto", label: "自動で紐付き" },
  { value: "confirmed", label: "確定済み" },
  { value: "excluded", label: "対象外" },
];

/** 候補の根拠。**いずれも自動確定には使わない**（人が選ぶための手がかり） */
const REASON_LABEL: Record<FreeePartnerCandidate["reason"], string> = {
  name: "名称が一致",
  domain: "メールドメインが一致",
  phone: "電話番号が一致",
};

const styles = {
  th: {
    textAlign: "left",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-sumi500)",
    padding: "0.5rem 0.75rem",
    borderBottom: "1px solid var(--color-border-default)",
    whiteSpace: "nowrap",
  } as CSSProperties,
  td: {
    fontSize: "0.8125rem",
    color: "var(--color-text-body)",
    padding: "0.625rem 0.75rem",
    borderBottom: "1px solid var(--color-border-subtle)",
    verticalAlign: "top",
  } as CSSProperties,
  panel: {
    backgroundColor: "var(--color-bg-subtle)",
    padding: "1rem",
    borderBottom: "1px solid var(--color-border-default)",
  } as CSSProperties,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "var(--radius-badge)",
    padding: "0.125rem 0.5rem",
    fontSize: "0.6875rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  } as CSSProperties,
  button: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 0.875rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  buttonGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "#fff",
    color: "var(--color-sumi700)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.375rem 0.875rem",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "var(--color-terra)",
    textDecoration: "none",
  } as CSSProperties,
  dl: {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    gap: "0.25rem 0.75rem",
    fontSize: "0.75rem",
    margin: "0 0 0.75rem 0",
  } as CSSProperties,
  warn: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    fontSize: "0.75rem",
    color: "#8A6D1E",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.35)",
    borderRadius: "var(--radius-md)",
    padding: "0.5rem 0.75rem",
    marginBottom: "0.75rem",
  } as CSSProperties,
} as const;

function statusBadge(status: FreeePartnerListItem["linkStatus"]) {
  const map = {
    unlinked: { label: "未紐付け", bg: "rgba(107, 114, 128, 0.12)", fg: "#4B5563" },
    auto: { label: "自動", bg: "rgba(37, 99, 235, 0.12)", fg: "#1D4ED8" },
    confirmed: { label: "確定済み", bg: "rgba(16, 185, 129, 0.14)", fg: "#047857" },
    excluded: { label: "対象外", bg: "rgba(107, 114, 128, 0.12)", fg: "#6B7280" },
  } as const;
  const s = map[status];
  return (
    <span style={{ ...styles.badge, backgroundColor: s.bg, color: s.fg }}>{s.label}</span>
  );
}

interface Props {
  initialData: { rows: FreeePartnerListItem[]; total: number } | null;
  loadError: string | null;
  defaultLinkStatus: string;
}

export function FreeePartnersView({ initialData, loadError, defaultLinkStatus }: Props) {
  const { showToast } = useToast();
  const router = useRouter();

  const { filters, page, setFilter, setPage, clear, isPending, data } = useListView({
    filterKeys: LIST_FILTER_KEYS.freeePartners,
    initialData,
    load: (state) =>
      listFreeePartners({
        linkStatus: state.filters.linkStatus ?? defaultLinkStatus,
        search: state.filters.search || undefined,
        includeInactive: state.filters.includeInactive === "1",
        page: state.page,
        perPage: PER_PAGE,
      }),
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FreeePartnerCandidate[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<FreeePartnerListItem | null>(null);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const linkStatus = filters.linkStatus ?? defaultLinkStatus;
  const keyword = filters.search ?? "";
  const includeInactive = filters.includeInactive === "1";

  const toggleExpand = async (row: FreeePartnerListItem) => {
    if (expandedId === row.id) {
      setExpandedId(null);
      setCandidates(null);
      return;
    }
    setExpandedId(row.id);
    setCandidates(null);
    setLoadingCandidates(true);
    try {
      const res = await getFreeePartnerCandidates(row.id);
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      setCandidates(res.data ?? []);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const reload = () => {
    // 一覧は URL の条件で取り直す。ページはそのまま
    router.refresh();
    setExpandedId(null);
    setCandidates(null);
  };

  const runConfirm = async (row: FreeePartnerListItem, companyId: string) => {
    setBusyId(row.id);
    try {
      const res = await confirmFreeePartnerLink({ partnerId: row.id, companyId });
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      showToast({ type: "success", message: `${row.name} を紐付けました` });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  /** 確認ダイアログから呼ぶので、結果を返してダイアログ側にエラーを出させる */
  const runRegister = async (
    row: FreeePartnerListItem
  ): Promise<{ error: string | null }> => {
    setBusyId(row.id);
    try {
      const res = await registerFreeePartnerCompany(row.id);
      if (res.error || !res.data) {
        return { error: res.error ?? "作成に失敗しました" };
      }
      showToast({
        type: "success",
        message: `${row.name} を事業者情報として登録しました（取引先は契約時に作られます）`,
      });
      reload();
      return { error: null };
    } finally {
      setBusyId(null);
    }
  };

  const runExclude = async (row: FreeePartnerListItem) => {
    setBusyId(row.id);
    try {
      const res = await excludeFreeePartner(row.id);
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      showToast({ type: "success", message: `${row.name} を対象外にしました` });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const runUnlink = async (row: FreeePartnerListItem) => {
    setBusyId(row.id);
    try {
      const res = await unlinkFreeePartner(row.id);
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      showToast({ type: "success", message: `${row.name} の紐付けを解除しました` });
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <Link
          href="/admin/freee"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.375rem 0.625rem",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.8125rem",
          }}
        >
          <ArrowLeft size={14} />
          freee 連携
        </Link>
        <h1
          className="text-xl sm:text-2xl font-bold"
          style={{ color: "var(--color-text-title)" }}
        >
          取引先の突合
        </h1>
      </div>

      <p
        style={{
          fontSize: "0.75rem",
          color: "var(--color-sumi500)",
          lineHeight: 1.7,
          marginBottom: "1rem",
        }}
      >
        インボイス登録番号が一致した取引先は自動で紐付いています。それ以外は候補を見て、
        <strong>既存の事業者情報へ紐付ける</strong>か、
        <strong>事業者情報を新しく作る</strong>か、
        <strong>対象外にする</strong>かを選んでください。
        取引先（Account）は契約が成立したときにだけ作られるため、ここでは作成しません。
      </p>

      {loadError && (
        <div
          style={{
            ...styles.warn,
            color: "#B91C1C",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
          }}
        >
          <AlertTriangle size={16} />
          {loadError}
        </div>
      )}

      <FilterGroup className="mb-4">
        <FilterSelect
          label="紐付け状態"
          value={linkStatus}
          options={LINK_STATUS_OPTIONS}
          onChange={(v) => setFilter("linkStatus", v)}
        />
        <FilterSelect
          label="使用停止・削除"
          value={includeInactive ? "1" : ""}
          options={[{ value: "1", label: "含める" }]}
          onChange={(v) => setFilter("includeInactive", v)}
        />
        <SearchInput
          value={keyword}
          placeholder="取引先名・インボイス番号で検索..."
          onChange={(v) => setFilter("search", v)}
        />
        <FilterClearButton onClear={clear} />
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

      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--elevation-low)",
          overflow: "hidden",
        }}
      >
        {rows.length === 0 ? (
          <p
            style={{
              padding: "2rem",
              textAlign: "center",
              fontSize: "0.875rem",
              color: "var(--color-sumi500)",
            }}
          >
            該当する取引先はありません。
          </p>
        ) : (
          <div className={tableScrollClass}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 32 }} aria-label="展開" />
                  <th style={styles.th}>freee の取引先</th>
                  <th style={styles.th}>インボイス番号</th>
                  <th style={styles.th}>種別</th>
                  <th style={styles.th}>状態</th>
                  <th style={styles.th}>CRM の紐付け先</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const expanded = expandedId === row.id;
                  return (
                    // 行と展開パネルの 2 行を返すので Fragment に key を付ける
                    <Fragment key={row.id}>
                      <tr>
                        <td style={styles.td}>
                          <button
                            type="button"
                            onClick={() => void toggleExpand(row)}
                            aria-label={expanded ? "閉じる" : "詳細と候補を見る"}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--color-sumi500)",
                              padding: 0,
                            }}
                          >
                            {expanded ? (
                              <ChevronDown size={16} />
                            ) : (
                              <ChevronRight size={16} />
                            )}
                          </button>
                        </td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 600 }}>{row.name}</div>
                          {row.longName && row.longName !== row.name && (
                            <div
                              style={{ fontSize: "0.75rem", color: "var(--color-sumi500)" }}
                            >
                              {row.longName}
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>
                          {row.invoiceRegistrationNumber ?? "—"}
                          {row.invoiceMismatch && (
                            <div
                              style={{
                                fontSize: "0.6875rem",
                                color: "#8A6D1E",
                                marginTop: "0.25rem",
                              }}
                            >
                              CRM は {row.crmInvoiceRegistrationNumber}
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>
                          {row.orgCode === 1 ? "法人" : row.orgCode === 2 ? "個人" : "—"}
                        </td>
                        <td style={styles.td}>
                          <div
                            style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}
                          >
                            {statusBadge(row.linkStatus)}
                            {!row.available && (
                              <span
                                style={{
                                  ...styles.badge,
                                  backgroundColor: "rgba(107, 114, 128, 0.12)",
                                  color: "#6B7280",
                                }}
                              >
                                使用停止
                              </span>
                            )}
                            {row.freeeDeletedAt && (
                              <span
                                style={{
                                  ...styles.badge,
                                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                                  color: "#B91C1C",
                                }}
                              >
                                freee 側で削除
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={styles.td}>
                          {row.companyId ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.125rem",
                              }}
                            >
                              <Link
                                href={`/companies/${row.companyId}`}
                                style={styles.link}
                              >
                                {row.companyName ?? "事業者情報"}
                                <ArrowUpRight size={12} />
                              </Link>
                              {row.accountId ? (
                                <Link
                                  href={`/accounts/${row.accountId}`}
                                  style={{ ...styles.link, fontSize: "0.75rem" }}
                                >
                                  {row.accountName ?? "取引先"}
                                  <ArrowUpRight size={12} />
                                </Link>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "0.6875rem",
                                    color: "var(--color-sumi500)",
                                  }}
                                >
                                  取引先はまだありません（契約時に作られます）
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td colSpan={6} style={styles.panel}>
                            {row.invoiceMismatch && (
                              <div style={styles.warn}>
                                <AlertTriangle size={16} />
                                インボイス番号が CRM と食い違っています（CRM:{" "}
                                {row.crmInvoiceRegistrationNumber} / freee:{" "}
                                {row.invoiceRegistrationNumber}）。
                                <strong>CRM の値が正</strong>
                                です。必要なら事業者情報側を確認してください。
                              </div>
                            )}

                            <dl style={styles.dl}>
                              <dt style={{ color: "var(--color-sumi500)" }}>カナ</dt>
                              <dd style={{ margin: 0 }}>{row.nameKana ?? "—"}</dd>
                              <dt style={{ color: "var(--color-sumi500)" }}>担当者</dt>
                              <dd style={{ margin: 0 }}>{row.contactName ?? "—"}</dd>
                              <dt style={{ color: "var(--color-sumi500)" }}>連絡先</dt>
                              <dd style={{ margin: 0 }}>
                                {[row.phone, row.email].filter(Boolean).join(" / ") || "—"}
                              </dd>
                              <dt style={{ color: "var(--color-sumi500)" }}>法人番号</dt>
                              <dd style={{ margin: 0 }}>
                                {row.corporateNumber ?? "—"}
                                {row.orgCode === 2 && (
                                  <span
                                    style={{
                                      color: "var(--color-sumi500)",
                                      marginLeft: "0.5rem",
                                    }}
                                  >
                                    （個人事業主のため導出しません）
                                  </span>
                                )}
                              </dd>
                              <dt style={{ color: "var(--color-sumi500)" }}>
                                freee の更新日
                              </dt>
                              <dd style={{ margin: 0 }}>{row.freeeUpdateDate ?? "—"}</dd>
                            </dl>

                            {row.linkStatus === "unlinked" ? (
                              <>
                                <div
                                  style={{
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    color: "var(--color-sumi700)",
                                    marginBottom: "0.5rem",
                                  }}
                                >
                                  紐付けの候補
                                </div>

                                {loadingCandidates ? (
                                  <p
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--color-sumi500)",
                                    }}
                                  >
                                    候補を探しています...
                                  </p>
                                ) : candidates && candidates.length > 0 ? (
                                  <ul
                                    style={{
                                      listStyle: "none",
                                      padding: 0,
                                      margin: "0 0 0.75rem 0",
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "0.375rem",
                                    }}
                                  >
                                    {candidates.map((c) => (
                                      <li
                                        key={`${c.companyId}-${c.reason}`}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.625rem",
                                          flexWrap: "wrap",
                                          backgroundColor: "#fff",
                                          border: "1px solid var(--color-border-default)",
                                          borderRadius: "var(--radius-md)",
                                          padding: "0.5rem 0.75rem",
                                        }}
                                      >
                                        <Building2
                                          size={14}
                                          style={{ color: "var(--color-sumi500)" }}
                                        />
                                        <Link
                                          href={`/companies/${c.companyId}`}
                                          style={styles.link}
                                        >
                                          {c.companyName}
                                          <ArrowUpRight size={12} />
                                        </Link>
                                        <span
                                          style={{
                                            ...styles.badge,
                                            backgroundColor: "rgba(37, 99, 235, 0.1)",
                                            color: "#1D4ED8",
                                          }}
                                        >
                                          {REASON_LABEL[c.reason]}
                                        </span>
                                        <span
                                          style={{
                                            fontSize: "0.6875rem",
                                            color: "var(--color-sumi500)",
                                          }}
                                        >
                                          取引先 {c.accountCount} 件
                                        </span>
                                        <button
                                          type="button"
                                          style={{
                                            ...styles.button,
                                            marginLeft: "auto",
                                            ...(busyId === row.id
                                              ? { opacity: 0.6, cursor: "not-allowed" }
                                              : {}),
                                          }}
                                          disabled={busyId === row.id}
                                          onClick={() => void runConfirm(row, c.companyId)}
                                        >
                                          これに紐付ける
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--color-sumi500)",
                                      marginBottom: "0.75rem",
                                    }}
                                  >
                                    候補は見つかりませんでした。CRM に無い取引先であれば、
                                    事業者情報として登録できます。
                                  </p>
                                )}

                                <div
                                  style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                                >
                                  <button
                                    type="button"
                                    style={{
                                      ...styles.button,
                                      ...(busyId === row.id
                                        ? { opacity: 0.6, cursor: "not-allowed" }
                                        : {}),
                                    }}
                                    disabled={busyId === row.id}
                                    onClick={() => setConfirmTarget(row)}
                                  >
                                    <Plus size={14} />
                                    事業者情報として登録
                                  </button>
                                  <button
                                    type="button"
                                    style={{
                                      ...styles.buttonGhost,
                                      ...(busyId === row.id
                                        ? { opacity: 0.6, cursor: "not-allowed" }
                                        : {}),
                                    }}
                                    disabled={busyId === row.id}
                                    onClick={() => void runExclude(row)}
                                  >
                                    <XCircle size={14} />
                                    対象外にする
                                  </button>
                                </div>
                              </>
                            ) : (
                              <button
                                type="button"
                                style={{
                                  ...styles.buttonGhost,
                                  ...(busyId === row.id
                                    ? { opacity: 0.6, cursor: "not-allowed" }
                                    : {}),
                                }}
                                disabled={busyId === row.id}
                                onClick={() => void runUnlink(row)}
                              >
                                <Link2Off size={14} />
                                {row.linkStatus === "excluded"
                                  ? "対象外を取り消す"
                                  : "紐付けを解除する"}
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        totalCount={total}
        pageSize={PER_PAGE}
        onPageChange={setPage}
      />

      <ConfirmDialog
        open={confirmTarget !== null}
        title="事業者情報として登録します"
        message={
          confirmTarget
            ? `「${confirmTarget.name}」を事業者情報として新しく登録し、この freee 取引先と紐付けます。` +
              "取引先（Account）は作りません（契約が成立したときに作られます）。"
            : ""
        }
        confirmLabel="登録する"
        onConfirm={async () => {
          const target = confirmTarget;
          if (!target) return { error: null };
          const result = await runRegister(target);
          // エラーはダイアログ内に出す（閉じてしまうと理由が読めない）
          if (!result.error) setConfirmTarget(null);
          return result;
        }}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}

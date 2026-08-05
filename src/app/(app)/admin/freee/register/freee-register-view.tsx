"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Link2,
  Plus,
} from "lucide-react";
import {
  confirmFreeePartnerLink,
  getFreeeCandidatesForCompany,
  listCompaniesWithoutFreeePartner,
  registerCompanyToFreee,
} from "@/actions/freee";
import { useListView } from "@/hooks/useListView";
import { LIST_FILTER_KEYS } from "@/lib/list-sort";
import { SearchInput } from "@/components/ui/SearchInput";
import { FilterGroup, FilterClearButton } from "@/components/ui/FilterGroup";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/pagination";
import { tableScrollClass } from "@/lib/layout";
import type {
  FreeeCandidateForCompany,
  FreeeUnlinkedCompany,
} from "@/types/relations";

/**
 * CRM にあって freee に無い事業者を freee へ登録する画面。
 *
 * **必ず候補を確認してから登録する。** freee は取引先名の重複を許すため、
 * 確認せずに作ると表記ゆれで同じ相手が 2 つできる（§26.8）。
 * 候補が既にあるなら、新規登録ではなく紐付けを選ぶ。
 */

const PER_PAGE = DEFAULT_PAGE_SIZE;

/** 候補の根拠。**自動確定には使わない**（人が選ぶための手がかり） */
const REASON_LABEL: Record<FreeeCandidateForCompany["reason"], string> = {
  invoice: "インボイス番号が一致",
  name: "名称が一致",
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
  code: {
    fontSize: "0.6875rem",
    color: "var(--color-sumi500)",
    fontVariantNumeric: "tabular-nums",
  } as CSSProperties,
} as const;

function valueText(v: string | null): string {
  return v === null || v === "" ? "—" : v;
}

export function FreeeRegisterView({
  initialData,
  loadError,
}: {
  initialData: { rows: FreeeUnlinkedCompany[]; total: number } | null;
  loadError: string | null;
}) {
  const { showToast } = useToast();

  const router = useRouter();

  const { filters, page, setFilter, setPage, clear, isPending, data } = useListView({
    filterKeys: LIST_FILTER_KEYS.freeeRegister,
    initialData,
    load: (state) =>
      listCompaniesWithoutFreeePartner({
        search: state.filters.search || undefined,
        page: state.page,
        perPage: PER_PAGE,
      }),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const keyword = filters.search ?? "";

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<FreeeCandidateForCompany[] | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<FreeeUnlinkedCompany | null>(null);

  /** 展開と同時に候補を読む。**確認しないまま登録させない**ための導線 */
  const toggle = async (company: FreeeUnlinkedCompany) => {
    if (expandedId === company.companyId) {
      setExpandedId(null);
      setCandidates(null);
      return;
    }
    setExpandedId(company.companyId);
    setCandidates(null);
    setLoadingCandidates(true);
    try {
      const res = await getFreeeCandidatesForCompany(company.companyId);
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

  /**
   * 確認ダイアログから呼ぶので、結果を返してダイアログ側にエラーを出させる。
   *
   * **失敗の理由はダイアログに残す。** freee の 400（コード重複など）は
   * 閉じてしまうと読めず、原因が分からないまま再試行されるため。
   */
  const register = async (
    company: FreeeUnlinkedCompany
  ): Promise<{ error: string | null }> => {
    setBusyId(company.companyId);
    try {
      const res = await registerCompanyToFreee(company.companyId);
      if (res.error || !res.data) {
        return { error: res.error ?? "freee への登録に失敗しました" };
      }
      showToast({
        type: "success",
        message: `${company.name} を freee に登録しました（取引先コード: ${company.companyCode}）`,
      });
      reload();
      return { error: null };
    } finally {
      setBusyId(null);
    }
  };

  /** 候補が既にあるなら、作らずに紐付ける（二重登録を避ける） */
  const link = async (company: FreeeUnlinkedCompany, partnerId: string) => {
    setBusyId(company.companyId);
    try {
      const res = await confirmFreeePartnerLink({
        partnerId,
        companyId: company.companyId,
      });
      if (res.error) {
        showToast({ type: "error", message: res.error });
        return;
      }
      showToast({
        type: "success",
        message: `${company.name} を freee の既存の取引先に紐づけました`,
      });
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
          連携する事業者を追加する
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
        freee と紐付いていない事業者情報の一覧です。行を開くと
        <strong>freee 側の似た取引先</strong>を確認できます。
        既にあるならそれに紐づけ、無ければ freee へ新しく登録してください。
        登録時に<strong>取引先コードとして事業者コード（CMP-…）が入ります</strong>。
        以後はこのコードで自動的に突合されます。
      </p>

      <div style={styles.warn}>
        <AlertTriangle size={16} />
        <span>
          <strong>freee は会計のデータです。</strong>
          「freee に登録する」を押すと freee 側に取引先が作られます。
          取引先コードは登録のときにしか入れられないため、
          <strong>作り直しでは直せません</strong>。似た取引先が無いか必ず確認してください。
        </span>
      </div>

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
        <SearchInput
          value={keyword}
          placeholder="事業者名・カナ・事業者コードで検索..."
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
            freee と紐付いていない事業者情報はありません。
          </p>
        ) : (
          <div className={tableScrollClass}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: 32 }} aria-label="展開" />
                  <th style={styles.th}>事業者情報</th>
                  <th style={styles.th}>事業種別</th>
                  <th style={styles.th}>電話番号</th>
                  <th style={styles.th}>インボイス番号</th>
                  <th style={{ ...styles.th, textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const expanded = expandedId === c.companyId;
                  const busy = busyId === c.companyId;
                  return (
                    <Fragment key={c.companyId}>
                      <tr>
                        <td style={styles.td}>
                          <button
                            type="button"
                            onClick={() => void toggle(c)}
                            aria-label={expanded ? "閉じる" : "候補を確認する"}
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
                          <div style={{ fontWeight: 500 }}>{c.name}</div>
                          {c.nameKana && (
                            <div style={styles.code}>{c.nameKana}</div>
                          )}
                          <div style={styles.code}>{c.companyCode}</div>
                        </td>
                        <td style={styles.td}>{valueText(c.corporateType)}</td>
                        <td style={styles.td}>{valueText(c.phone)}</td>
                        <td style={styles.td}>
                          {valueText(c.invoiceRegistrationNumber)}
                        </td>
                        <td style={{ ...styles.td, textAlign: "right" }}>
                          <button
                            type="button"
                            style={{
                              ...styles.buttonGhost,
                              ...(busy ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                            }}
                            disabled={busy}
                            onClick={() => void toggle(c)}
                          >
                            確認して登録
                          </button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr>
                          <td colSpan={6} style={styles.panel}>
                            {loadingCandidates ? (
                              <p style={{ fontSize: "0.8125rem", margin: 0 }}>
                                freee 側の似た取引先を探しています...
                              </p>
                            ) : candidates && candidates.length > 0 ? (
                              <>
                                <p
                                  style={{
                                    fontSize: "0.8125rem",
                                    margin: "0 0 0.625rem 0",
                                  }}
                                >
                                  <strong>似た取引先が freee にあります。</strong>
                                  同じ相手なら、新しく作らずに紐づけてください。
                                </p>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.5rem",
                                    marginBottom: "0.875rem",
                                  }}
                                >
                                  {candidates.map((cand) => {
                                    const taken =
                                      cand.linkStatus === "auto" ||
                                      cand.linkStatus === "confirmed";
                                    return (
                                      <div
                                        key={cand.partnerId}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "0.625rem",
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <button
                                          type="button"
                                          style={{
                                            ...styles.button,
                                            padding: "0.25rem 0.75rem",
                                            ...(busy || taken
                                              ? { opacity: 0.5, cursor: "not-allowed" }
                                              : {}),
                                          }}
                                          disabled={busy || taken}
                                          onClick={() => void link(c, cand.partnerId)}
                                        >
                                          <Link2 size={13} />
                                          {taken
                                            ? "別の事業者と紐付け済み"
                                            : "これと紐づける"}
                                        </button>
                                        <span style={{ fontSize: "0.8125rem" }}>
                                          {cand.partnerName}
                                        </span>
                                        <span style={styles.code}>
                                          {REASON_LABEL[cand.reason]}
                                          {cand.partnerCode
                                            ? ` / コード: ${cand.partnerCode}`
                                            : " / コード未設定"}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <p
                                style={{
                                  fontSize: "0.8125rem",
                                  margin: "0 0 0.875rem 0",
                                }}
                              >
                                freee に似た取引先は見つかりませんでした。
                                新しく登録して問題ありません。
                              </p>
                            )}

                            <button
                              type="button"
                              style={{
                                ...styles.button,
                                ...(busy ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                              }}
                              disabled={busy}
                              onClick={() => setConfirmTarget(c)}
                            >
                              <Plus size={14} />
                              {busy ? "登録中..." : "freee に登録する"}
                            </button>
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
        title="freee に取引先を登録します"
        message={
          confirmTarget
            ? `「${confirmTarget.name}」を freee の取引先として登録し、取引先コードに ${confirmTarget.companyCode} を入れます。` +
              `名称・カナ・電話番号・インボイス番号・住所・口座・担当者も一緒に送ります。` +
              `取引先コードは後から変更できません。`
            : ""
        }
        confirmLabel="登録する"
        onConfirm={async () => {
          const target = confirmTarget;
          if (!target) return { error: null };
          const result = await register(target);
          // エラーはダイアログ内に出す（閉じてしまうと理由が読めない）
          if (!result.error) setConfirmTarget(null);
          return result;
        }}
        onClose={() => setConfirmTarget(null)}
      />
    </div>
  );
}

"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Loader2, Merge, RefreshCw, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  detectAllMergeCandidates,
  getActiveContactMergeDetectionJobs,
  getContactMergeDetectionJob,
  mergeContactsAction,
  previewContactMerge,
  rejectMergeCandidate,
  type ContactMergeDetectionJob,
} from "@/actions/contact-merge";
import type {
  ContactMergeCandidate,
  ContactMergePreview,
  ContactMergeSide,
} from "@/types/relations";

/**
 * 検出ジョブの状態を見に行く間隔。
 * ワーカーは毎分動くので、これより細かくしても着手は早くならない。
 * 進み具合が画面に出るまでの体感を短くするためだけの値（名刺取込と同じ値）
 */
const POLL_INTERVAL_MS = 3000;

/**
 * 統合候補の判断画面。
 *
 * 姓名が一致し会社が違う組を並べ、同一人物か別人かを人が決める。
 * **統合は取り消せない**ので、実行前に付け替わる件数を出す。
 */
export function MergeCandidatesView({
  candidates,
}: {
  candidates: ContactMergeCandidate[];
}) {
  const router = useRouter();
  const { showToast } = useToast();

  // どちらを残すかは利用者が選ぶ。既定は先に登録された方
  const [target, setTarget] = useState<{
    candidate: ContactMergeCandidate;
    keep: ContactMergeSide;
    merge: ContactMergeSide;
    preview: ContactMergePreview | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  async function openMerge(
    candidate: ContactMergeCandidate,
    keep: ContactMergeSide,
    merge: ContactMergeSide
  ) {
    setTarget({ candidate, keep, merge, preview: null });
    const { data, error } = await previewContactMerge(keep.id, merge.id);
    if (error) {
      showToast({ type: "error", message: error });
      setTarget(null);
      return;
    }
    setTarget({ candidate, keep, merge, preview: data });
  }

  async function runMerge() {
    if (!target) return { error: "対象がありません" };
    setLoading(true);
    const { error } = await mergeContactsAction(target.keep.id, target.merge.id);
    setLoading(false);
    if (error) return { error };

    showToast({ type: "success", message: "連絡先を統合しました" });
    setTarget(null);
    router.refresh();
    return { error: null };
  }

  async function reject(candidate: ContactMergeCandidate) {
    const { error } = await rejectMergeCandidate(candidate.id);
    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    showToast({ type: "info", message: "別人として記録しました" });
    router.refresh();
  }

  if (candidates.length === 0) {
    return (
      <p style={{ color: "var(--color-sumi500)", fontSize: "0.875rem" }}>
        判断待ちの統合候補はありません。
      </p>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {candidates.map((c) => {
          if (!c.contact || !c.candidate) return null;
          // 先に登録された方を既定で残す（履歴が長い側であることが多い）
          const [older, newer] =
            c.contact.created_at <= c.candidate.created_at
              ? [c.contact, c.candidate]
              : [c.candidate, c.contact];

          return (
            <div key={c.id} style={styles.card}>
              <div style={styles.pair}>
                <ContactCard side={older} label="先に登録" />
                <ArrowRight
                  size={16}
                  style={{ color: "var(--color-sumi400)", flexShrink: 0 }}
                />
                <ContactCard side={newer} label="後から登録" />
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  style={styles.btnPrimary}
                  onClick={() => openMerge(c, older, newer)}
                >
                  <Merge size={14} />
                  統合する
                </button>
                {/* 残す側を入れ替えたい場合のために逆向きも用意する */}
                <button
                  type="button"
                  style={styles.btnGhost}
                  onClick={() => openMerge(c, newer, older)}
                >
                  逆向きで統合
                </button>
                <button
                  type="button"
                  style={styles.btnGhost}
                  onClick={() => reject(c)}
                >
                  <X size={14} />
                  別人として閉じる
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={target !== null}
        title="連絡先を統合します"
        message={buildMessage(target)}
        confirmLabel={loading ? "統合中..." : "統合する"}
        danger
        onConfirm={runMerge}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

/**
 * 全件を突き合わせて候補を洗い直す。
 * 検出は名刺取込の中でしか走らないので、それ以外で増えた重複はここから拾う。
 *
 * 全連絡先の総当たりは件数に比例して伸びるため、実行は pg_cron のワーカーに任せる
 * ジョブ方式（`admin_bulk_jobs`）。ここではジョブを投入し、状態をポーリングする
 * （名刺取込と同じ画面表現。閉じても検出は続く）。
 */
export function DetectAllButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState<ContactMergeDetectionJob | null>(null);

  // 開き直したときに実行中のジョブを拾い直す
  useEffect(() => {
    let canceled = false;
    if (job) return;

    (async () => {
      const res = await getActiveContactMergeDetectionJobs();
      if (canceled || !res.data || res.data.length === 0) return;
      setJob(res.data[0]);
    })();

    return () => {
      canceled = true;
    };
  }, [job]);

  // 実行中のジョブをポーリングする
  useEffect(() => {
    if (!job || job.status === "succeeded" || job.status === "failed") return;

    const timer = setInterval(async () => {
      const res = await getContactMergeDetectionJob(job.id);
      if (!res.data) return;
      setJob(res.data);
      if (res.data.status === "succeeded") {
        const count = res.data.newCandidateCount ?? 0;
        showToast({
          type: count > 0 ? "success" : "info",
          message: count > 0 ? `統合候補が ${count} 件見つかりました` : "新しい統合候補はありませんでした",
        });
        router.refresh();
        setJob(null);
      } else if (res.data.status === "failed") {
        showToast({ type: "error", message: res.data.errorMessage ?? "検出に失敗しました" });
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [job, showToast, router]);

  async function run() {
    setStarting(true);
    const { data, error } = await detectAllMergeCandidates();
    setStarting(false);

    if (error) {
      showToast({ type: "error", message: error });
      return;
    }
    if (data) {
      const accepted = await getContactMergeDetectionJob(data.jobId);
      setJob(
        accepted.data ?? {
          id: data.jobId,
          status: "queued",
          requestedAt: new Date().toISOString(),
          startedAt: null,
          finishedAt: null,
          newCandidateCount: null,
          errorMessage: null,
        }
      );
    }
  }

  const running = job?.status === "queued" || job?.status === "running";

  return (
    <>
      <button
        type="button"
        className="hover:bg-[var(--color-bg-hover)]"
        style={{ ...styles.btnGhost, ...(starting || running ? styles.btnBusy : null) }}
        onClick={run}
        disabled={starting || running}
      >
        <RefreshCw size={14} />
        {running ? "検出中..." : "候補を洗い直す"}
      </button>

      {running && (
        <div style={{ ...styles.alertInfo, width: "100%" }}>
          <strong style={styles.alertTitle}>
            <Loader2 size={16} className="animate-spin" />
            {job?.status === "queued" ? "検出の順番を待っています" : "検出を実行しています"}
          </strong>
          この画面を閉じても検出は続きます。あとで開き直せば結果を確認できます。
        </div>
      )}

      {job?.status === "failed" && (
        <div style={{ ...styles.alertError, width: "100%" }}>
          <strong style={styles.alertTitle}>
            <AlertTriangle size={16} />
            検出に失敗しました
          </strong>
          {job.errorMessage ?? "原因を特定できませんでした"}
        </div>
      )}
    </>
  );
}

function ContactCard({ side, label }: { side: ContactMergeSide; label: string }) {
  return (
    <div style={styles.side}>
      <span style={styles.sideLabel}>{label}</span>
      <Link
        href={`/contacts/${side.id}`}
        className="hover:bg-[var(--color-bg-hover)]"
        style={styles.name}
      >
        {[side.last_name, side.first_name].filter(Boolean).join(" ")}
      </Link>
      <span style={styles.meta}>{side.company?.name ?? "所属不明"}</span>
      {(side.department || side.job_title) && (
        <span style={styles.meta}>
          {[side.department, side.job_title].filter(Boolean).join(" ・ ")}
        </span>
      )}
      {(side.last_name_kana || side.first_name_kana) && (
        <span style={styles.meta}>
          {[side.last_name_kana, side.first_name_kana].filter(Boolean).join(" ")}
        </span>
      )}
    </div>
  );
}

/** 何が動くかを文章で示す。取り消せない操作なので件数まで出す */
function buildMessage(
  target: {
    keep: ContactMergeSide;
    merge: ContactMergeSide;
    preview: ContactMergePreview | null;
  } | null
): string {
  if (!target) return "";
  const keepName = [target.keep.last_name, target.keep.first_name]
    .filter(Boolean)
    .join(" ");
  const mergeName = [target.merge.last_name, target.merge.first_name]
    .filter(Boolean)
    .join(" ");
  const p = target.preview;

  if (!p) return "統合の内容を確認しています...";

  if (p.talent_conflict) {
    return `両方にタレント情報があるため統合できません。どちらかを整理してからやり直してください。`;
  }

  const moved = [
    p.emails && `メール ${p.emails} 件`,
    p.phones && `電話 ${p.phones} 件`,
    p.cards && `名刺 ${p.cards} 枚`,
    p.addresses && `住所 ${p.addresses} 件`,
    p.leads && `リード ${p.leads} 件`,
    p.deals && `ディール ${p.deals} 件`,
    p.contracts && `契約 ${p.contracts} 件`,
    p.accounts && `取引先の紐付け ${p.accounts} 件`,
    p.emails_synced && `メール履歴 ${p.emails_synced} 件`,
    p.activities && `アクティビティ ${p.activities} 件`,
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    `「${mergeName}」を「${keepName}」に統合します。`,
    moved ? `引き継ぐもの: ${moved}` : "引き継ぐデータはありません。",
    `統合した側は削除済みとして閉じられ、この操作は取り消せません。`,
  ].join("\n");
}

const styles = {
  card: {
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-card)",
    padding: "1rem",
    backgroundColor: "#fff",
  } as CSSProperties,
  pair: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    flexWrap: "wrap",
  } as CSSProperties,
  side: {
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    minWidth: 200,
    flex: 1,
  } as CSSProperties,
  sideLabel: {
    fontSize: "0.625rem",
    color: "var(--color-sumi500)",
  } as CSSProperties,
  name: {
    fontSize: "0.9375rem",
    fontWeight: 500,
    color: "var(--color-text-title)",
    textDecoration: "none",
    borderRadius: "var(--radius-sm)",
    margin: "0 -0.25rem",
    padding: "0.125rem 0.25rem",
    width: "fit-content",
  } as CSSProperties,
  meta: {
    fontSize: "0.75rem",
    color: "var(--color-sumi600)",
  } as CSSProperties,
  actions: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.875rem",
    flexWrap: "wrap",
  } as CSSProperties,
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "var(--color-terra)",
    color: "#fff",
    border: "none",
    borderRadius: "var(--radius-button)",
    padding: "0.4375rem 0.875rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
  } as CSSProperties,
  btnGhost: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    backgroundColor: "transparent",
    color: "var(--color-sumi600)",
    border: "1px solid var(--color-border-default)",
    borderRadius: "var(--radius-button)",
    padding: "0.4375rem 0.875rem",
    fontSize: "0.8125rem",
    cursor: "pointer",
  } as CSSProperties,
  btnBusy: {
    cursor: "progress",
    opacity: 0.6,
  } as CSSProperties,
  // 実行中の案内。成功でも失敗でもないので緑・赤とは別の色を使う（名刺取込と同じ配色）
  alertInfo: {
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    border: "1px solid rgba(59, 130, 246, 0.3)",
    borderRadius: "var(--radius-md)",
    padding: "0.875rem 1rem",
    color: "#1D4ED8",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  } as CSSProperties,
  alertError: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-md)",
    padding: "0.875rem 1rem",
    color: "var(--color-error)",
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  } as CSSProperties,
  alertTitle: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    marginBottom: "0.375rem",
  } as CSSProperties,
};

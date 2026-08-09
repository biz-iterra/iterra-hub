"use server";

import { createClient } from "@/lib/supabase/server";
import { toUserMessage } from "@/lib/db-error";
import { revalidatePath } from "next/cache";

/**
 * 全 Lead スコア再計算をジョブ方式で投入する。
 *
 * `recalculate_all_lead_scores()` は週次の pg_cron（`docs/database-design.md` §11.12.7）
 * で自動実行されるが、マスタ（スコアリングルール等）を変更した直後に即時反映したい
 * 場合の手動実行はここから行う。全 Lead を総当たりで処理するため件数に比例して
 * 時間がかかり、HTTP リクエストの中で完結させると件数が増えるたびに壁に当たる
 * （名刺取込と同じ構造）。実行は pg_cron のワーカー（process_admin_bulk_jobs）に任せ、
 * 画面はジョブの状態をポーリングする（`docs/database-design.md` §27）。
 */

type ActionResult<T> = { data: T | null; error: string | null };

/** 詳細ページと同じ形式で id を検証する（CLAUDE.md の [id] ルート規約に合わせる） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証が必要です" };

  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (crmUser?.role !== "admin") return { error: "管理者権限が必要です" };
  return { supabase, userId: user.id };
}

export type LeadScoreRecalcJob = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** 再計算した Lead 件数（succeeded のとき埋まる） */
  recalculatedCount: number | null;
  /** 失敗理由。DB には原文が入るので、ここで日本語へ直してから返す */
  errorMessage: string | null;
};

type JobRow = {
  id: string;
  status: LeadScoreRecalcJob["status"];
  requested_at: string;
  started_at: string | null;
  finished_at: string | null;
  result_count: number | null;
  error_message: string | null;
};

const JOB_COLUMNS = "id, status, requested_at, started_at, finished_at, result_count, error_message";

function toRecalcJob(row: JobRow): LeadScoreRecalcJob {
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    recalculatedCount: row.result_count,
    errorMessage: row.error_message
      ? toUserMessage({ message: row.error_message }, { entityLabel: "リード" })
      : null,
  };
}

/** 全 Lead スコア再計算ジョブを投入する。admin のみ */
export async function triggerLeadScoreRecalc(): Promise<ActionResult<{ jobId: string }>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const { data, error } = await auth.supabase
    .from("admin_bulk_jobs")
    .insert({ job_type: "lead_score_recalc", requested_by: auth.userId })
    .select("id")
    .single();

  if (error) {
    return {
      data: null,
      error: `再計算を開始できませんでした。${toUserMessage(error, { entityLabel: "スコア再計算ジョブ", operation: "create" })}`,
    };
  }

  revalidatePath("/admin");
  return { data: { jobId: data.id }, error: null };
}

/** スコア再計算ジョブを 1 件取る（画面のポーリング用） */
export async function getLeadScoreRecalcJob(
  jobId: string
): Promise<ActionResult<LeadScoreRecalcJob>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  if (!UUID_RE.test(jobId)) return { data: null, error: "不正なパラメータです" };

  const { data, error } = await auth.supabase
    .from("admin_bulk_jobs")
    .select(JOB_COLUMNS)
    .eq("id", jobId)
    .eq("job_type", "lead_score_recalc")
    .maybeSingle<JobRow>();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };
  if (!data) return { data: null, error: "再計算ジョブが見つかりません" };

  return { data: toRecalcJob(data), error: null };
}

/** 実行待ち・実行中の再計算ジョブ（画面を開き直したときに拾い直すため） */
export async function getActiveLeadScoreRecalcJobs(): Promise<ActionResult<LeadScoreRecalcJob[]>> {
  const auth = await requireAdmin();
  if ("error" in auth) return { data: null, error: auth.error };

  const { data, error } = await auth.supabase
    .from("admin_bulk_jobs")
    .select(JOB_COLUMNS)
    .eq("job_type", "lead_score_recalc")
    .in("status", ["queued", "running"])
    .order("requested_at", { ascending: true })
    .returns<JobRow[]>();

  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "リード" }) };

  return { data: (data ?? []).map(toRecalcJob), error: null };
}

"use server";

/**
 * アクティビティ横断フィード
 *
 * 社内対応・顧客行動・メールを 1 本の時系列にした activity_feed ビューを読む。
 * ビューは security_invoker なので RLS は元テーブルのものがそのまま効く
 * （member は自分が担当するリード・連絡先の分だけ見える）。
 *
 * 読み取り専用。記録の追加は各エンティティの画面から行う。
 */

import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import type { ActivityFeedRow, ActivityFeedSourceKind } from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

const PER_PAGE = 30;

const SOURCE_KINDS: ActivityFeedSourceKind[] = [
  "lead_activity",
  "lead_customer_activity",
  "email",
];

export type ActivityFeedParams = {
  page?: number;
  perPage?: number;
  /** 未指定なら全種別 */
  sourceKinds?: ActivityFeedSourceKind[];
  /** YYYY-MM-DD。その日を含む */
  from?: string;
  /** YYYY-MM-DD。その日を含む */
  to?: string;
  /** 相手先の名前・内容の部分一致 */
  q?: string;
  /** 担当者で絞る（リードの担当・連絡先の担当） */
  ownerUserId?: string;
};

export async function getActivityFeed(
  params?: ActivityFeedParams
): Promise<ActionResult<{ rows: ActivityFeedRow[]; total: number }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const page = Math.max(1, params?.page ?? 1);
  const perPage = params?.perPage ?? PER_PAGE;
  const from = (page - 1) * perPage;

  let query = supabase
    .from("activity_feed")
    .select("*", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(from, from + perPage - 1);

  // 未知の値が来ても弾かず既知のものだけ通す。全部選択と無指定は同じ扱い
  const kinds = params?.sourceKinds?.filter((k) => SOURCE_KINDS.includes(k)) ?? [];
  if (kinds.length > 0 && kinds.length < SOURCE_KINDS.length) {
    query = query.in("source_kind", kinds);
  }

  // 日付の境界は JST で解釈する。ビューの occurred_at は timestamptz
  if (params?.from) query = query.gte("occurred_at", `${params.from}T00:00:00+09:00`);
  if (params?.to) query = query.lte("occurred_at", `${params.to}T23:59:59+09:00`);

  if (params?.ownerUserId) query = query.eq("owner_user_id", params.ownerUserId);

  const q = params?.q?.trim();
  if (q) {
    // PostgREST の or は , で条件を割るため、値に含まれると壊れる
    const safe = q.replace(/[,()]/g, " ");
    query = query.or(`entity_label.ilike.%${safe}%,detail.ilike.%${safe}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: toUserMessage(error, { entityLabel: "アクティビティ" }) };

  return { data: { rows: (data ?? []) as ActivityFeedRow[], total: count ?? 0 }, error: null };
}

/** 種別ごとの件数。フィルタの横に出す */
export async function getActivityFeedCounts(): Promise<
  ActionResult<Record<ActivityFeedSourceKind, number>>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const results = await Promise.all(
    SOURCE_KINDS.map(async (kind) => {
      const { count, error } = await supabase
        .from("activity_feed")
        .select("id", { count: "exact", head: true })
        .eq("source_kind", kind);
      return { kind, count: error ? 0 : (count ?? 0) };
    })
  );

  const counts = results.reduce(
    (acc, r) => ({ ...acc, [r.kind]: r.count }),
    {} as Record<ActivityFeedSourceKind, number>
  );
  return { data: counts, error: null };
}

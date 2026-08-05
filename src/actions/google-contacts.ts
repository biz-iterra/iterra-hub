"use server";

/**
 * Google コンタクト連携の Server Action。
 *
 * 接続は**ユーザーごと**で、他人の接続は触らせない（トークンを持つため
 * admin であっても操作させない。参照だけ可）。
 * 同期そのものは src/lib/google-contacts/sync.ts が行う。
 */

import { revalidatePath } from "next/cache";
import { toUserMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { isGoogleContactsConfigured } from "@/lib/google-contacts/config";
import {
  syncGoogleContactsConnection,
  type GoogleContactsSyncResult,
} from "@/lib/google-contacts/sync";
import type { GoogleContactConnectionSummary } from "@/types/relations";

type ActionResult<T> = { data: T | null; error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** 画面から設定状況だけを知りたいとき。値は返さない */
export async function getGoogleContactsSetupStatus(): Promise<
  ActionResult<{ configured: boolean }>
> {
  return { data: { configured: isGoogleContactsConfigured() }, error: null };
}

/**
 * 自分が繋いだ Google アカウント一覧。
 * トークンは返さない（画面で使う必要が無く、漏らす経路を作らないため）。
 */
export async function getMyGoogleContactConnections(): Promise<
  ActionResult<GoogleContactConnectionSummary[]>
> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("google_contact_connections")
    .select(
      "id, email_address, hd_domain, granted_scope, last_synced_at, last_error, " +
        "is_active, created_at, google_contact_links(count)"
    )
    .eq("crm_user_id", user.id)
    .eq("is_active", true)
    .order("created_at");

  if (error) {
    return {
      data: null,
      error: toUserMessage(error, { entityLabel: "Google コンタクト連携" }),
    };
  }

  const rows = (data ?? []) as unknown as (GoogleContactConnectionSummary & {
    google_contact_links: { count: number }[];
  })[];

  return {
    data: rows.map((r) => ({
      id: r.id,
      email_address: r.email_address,
      hd_domain: r.hd_domain,
      granted_scope: r.granted_scope,
      last_synced_at: r.last_synced_at,
      last_error: r.last_error,
      is_active: r.is_active,
      created_at: r.created_at,
      syncedCount: r.google_contact_links?.[0]?.count ?? 0,
    })),
    error: null,
  };
}

/**
 * 手動で同期する。
 *
 * **自分の接続だけ。** 1 回の実行には上限があり、初回の全件登録は
 * 数回に分かれる（戻り値の remaining が 0 になるまで押せば進む）。
 */
export async function syncMyGoogleContacts(
  connectionId: string
): Promise<ActionResult<GoogleContactsSyncResult>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "認証が必要です" };
  if (!UUID_RE.test(connectionId)) {
    return { data: null, error: "不正なパラメータです" };
  }

  // **所有者の確認。** RLS でも守られるが、Server Action 側でも見る（多層防御）
  const { data: conn } = await supabase
    .from("google_contact_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("crm_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!conn) return { data: null, error: "Google との接続が見つかりません" };

  const { data, error } = await syncGoogleContactsConnection(connectionId, {
    actorId: user.id,
  });
  if (error) return { data: null, error };

  revalidatePath("/profile");
  return { data, error: null };
}

/**
 * 連携を解除する。
 *
 * **Google 側の連絡先は消さない。** 同期をやめるだけで、既に配ってある
 * 電話帳を勝手に消すと利用者が困る（回収したい場合は Google の画面で
 * 「ITERRA CRM」グループごと削除する。§6.1）。
 */
export async function disconnectGoogleContacts(
  connectionId: string
): Promise<ActionResult<true>> {
  const { supabase, user } = await getUser();
  if (!user) return { data: null, error: "認証が必要です" };
  if (!UUID_RE.test(connectionId)) {
    return { data: null, error: "不正なパラメータです" };
  }

  const { error } = await supabase
    .from("google_contact_connections")
    .update({ is_active: false })
    .eq("id", connectionId)
    .eq("crm_user_id", user.id);

  if (error) {
    return {
      data: null,
      error: toUserMessage(error, { entityLabel: "Google コンタクト連携" }),
    };
  }

  revalidatePath("/profile");
  return { data: true, error: null };
}

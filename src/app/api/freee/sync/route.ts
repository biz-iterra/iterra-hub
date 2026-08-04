/**
 * freee 取引先の定期同期。NAS のタスクスケジューラから叩く。
 *
 *   # 日次（差分）
 *   docker exec iterra-hub-app wget -qO- --post-data='' \
 *     --header="Authorization: Bearer $FREEE_SYNC_CRON_SECRET" \
 *     http://127.0.0.1:3000/api/freee/sync
 *
 *   # 週次（全件・freee 側の削除を検出する）
 *   ... http://127.0.0.1:3000/api/freee/sync?full=1
 *
 * コンテナはポートを公開していないので外から到達する経路は無い。
 * それでも合言葉を要求するのは、同一ホスト上の別プロセスから
 * 叩けてしまう状態を残さないため。
 *
 * middleware の認証対象から外してある（Cookie を持たないリクエストが
 * /login へリダイレクトされるのを避けるため）。認証はここで行う。
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFreeeConfig, getFreeeSyncCronSecret } from "@/lib/freee/config";
import { syncFreeeConnection } from "@/lib/freee/sync";
import { bearerMatches } from "@/lib/gmail/secret";
import { toUserMessage } from "@/lib/db-error";

/**
 * 実行中フラグ。前回が終わる前に次が来たら見送る。
 * アプリのコンテナは 1 つなのでモジュール変数で足りる
 * （複数インスタンスに増やすときは DB のロックに移すこと）。
 */
let running = false;

export async function POST(request: NextRequest) {
  const secret = getFreeeSyncCronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "定期同期は無効です（FREEE_SYNC_CRON_SECRET が未設定）" },
      { status: 503 }
    );
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  if (!getFreeeConfig()) {
    return NextResponse.json({ error: "freee 連携が未設定です" }, { status: 503 });
  }

  if (running) {
    // 前回が長引いているだけなので異常ではない。次の実行に任せる
    return NextResponse.json(
      { skipped: true, reason: "前回の同期が実行中です" },
      { status: 409 }
    );
  }

  const full = request.nextUrl.searchParams.get("full") === "1";

  running = true;
  try {
    const admin = createAdminClient();
    const { data: connections, error } = await admin
      .from("freee_connections")
      .select("id, freee_company_name")
      .eq("is_active", true)
      .order("created_at");

    if (error) {
      return NextResponse.json(
        { error: toUserMessage(error, { entityLabel: "freee 連携" }) },
        { status: 500 }
      );
    }

    const results: {
      company: string;
      fetched?: number;
      autoLinked?: number;
      markedDeleted?: number;
      error?: string;
    }[] = [];

    for (const conn of connections ?? []) {
      // 1 件の失敗で残りを止めない。理由は last_error に残り、
      // 管理画面の連携欄に表示される
      const { data, error: syncError } = await syncFreeeConnection(conn.id, { full });
      const label = conn.freee_company_name ?? conn.id;
      results.push(
        syncError
          ? { company: label, error: syncError }
          : {
              company: label,
              fetched: data?.fetched ?? 0,
              autoLinked: data?.autoLinked ?? 0,
              markedDeleted: data?.markedDeleted ?? 0,
            }
      );
    }

    const failed = results.filter((r) => r.error).length;

    // タスクスケジューラのログに残るので、何が起きたか読める形で返す
    return NextResponse.json({
      connections: results.length,
      full,
      failed,
      results,
    });
  } finally {
    running = false;
  }
}

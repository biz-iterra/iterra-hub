/**
 * 定期同期の入口。NAS のタスクスケジューラから叩く。
 *
 *   docker exec iterra-hub-app wget -qO- --post-data='' \
 *     --header="Authorization: Bearer $GMAIL_SYNC_CRON_SECRET" \
 *     http://127.0.0.1:3000/api/gmail/sync
 *
 * コンテナはポートを公開していないので、外から到達する経路は無い。
 * それでも合言葉を要求するのは、同一ホスト上の別プロセスから
 * 叩けてしまう状態を残さないため。
 *
 * middleware の認証対象から外してある（Cookie を持たないリクエストが
 * /login へリダイレクトされるのを避けるため）。認証はここで行う。
 */

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailConfig, getSyncCronSecret } from "@/lib/gmail/config";
import { syncConnection } from "@/lib/gmail/sync";
import { bearerMatches } from "@/lib/gmail/secret";

/**
 * 実行中フラグ。前回が終わる前に次が来たら見送る。
 * アプリのコンテナは 1 つなので、モジュール変数で足りる
 * （複数インスタンスに増やすときは DB のロックに移すこと）。
 */
let running = false;

export async function POST(request: NextRequest) {
  const secret = getSyncCronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "定期同期は無効です（GMAIL_SYNC_CRON_SECRET が未設定）" },
      { status: 503 }
    );
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  if (!getGmailConfig()) {
    return NextResponse.json(
      { error: "Gmail 連携が未設定です" },
      { status: 503 }
    );
  }

  if (running) {
    // 前回が長引いているだけなので異常ではない。次の実行に任せる
    return NextResponse.json(
      { skipped: true, reason: "前回の同期が実行中です" },
      { status: 409 }
    );
  }

  running = true;
  try {
    const admin = createAdminClient();
    const { data: connections, error } = await admin
      .from("gmail_connections")
      .select("id, email_address")
      .eq("is_active", true)
      .order("created_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: {
      emailAddress: string;
      recorded?: number;
      skipped?: number;
      error?: string;
    }[] = [];

    for (const conn of connections ?? []) {
      // 1 件の失敗で残りを止めない。理由は last_error に残り、
      // プロフィール画面の連携欄に表示される
      const { data, error: syncError } = await syncConnection(conn.id);
      results.push(
        syncError
          ? { emailAddress: conn.email_address, error: syncError }
          : {
              emailAddress: conn.email_address,
              recorded: data?.recorded ?? 0,
              skipped: data?.skipped ?? 0,
            }
      );
    }

    const recorded = results.reduce((sum, r) => sum + (r.recorded ?? 0), 0);
    const failed = results.filter((r) => r.error).length;

    // タスクスケジューラのログに残るので、何が起きたか読める形で返す
    return NextResponse.json({
      connections: results.length,
      recorded,
      failed,
      results,
    });
  } finally {
    running = false;
  }
}

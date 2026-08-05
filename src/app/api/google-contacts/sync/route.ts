/**
 * Google コンタクト同期の定期実行の入口。NAS のタスクスケジューラから叩く。
 *
 *   docker exec iterra-hub-app wget -qO- --post-data='' \
 *     --header="Authorization: Bearer $GOOGLE_CONTACTS_SYNC_CRON_SECRET" \
 *     http://127.0.0.1:3000/api/google-contacts/sync
 *
 * コンテナはポートを公開していないので外から到達する経路は無い。
 * それでも合言葉を要求するのは、同一ホスト上の別プロセスから叩けてしまう
 * 状態を残さないため（Gmail / freee と同じ）。
 *
 * middleware の認証対象から外してある。認証はここで行う。
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  getGoogleContactsConfig,
  getGoogleContactsSyncCronSecret,
} from "@/lib/google-contacts/config";
import { syncAllGoogleContactConnections } from "@/lib/google-contacts/sync";
import { bearerMatches } from "@/lib/gmail/secret";

/**
 * 実行中フラグ。前回が終わる前に次が来たら見送る。
 * アプリのコンテナは 1 つなのでモジュール変数で足りる
 * （複数インスタンスに増やすときは DB のロックに移すこと）。
 */
let running = false;

export async function POST(request: NextRequest) {
  const secret = getGoogleContactsSyncCronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "定期同期は無効です（GOOGLE_CONTACTS_SYNC_CRON_SECRET が未設定）" },
      { status: 503 }
    );
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  if (!getGoogleContactsConfig()) {
    return NextResponse.json(
      { error: "Google コンタクト連携が未設定です" },
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
    const { results, errors } = await syncAllGoogleContactConnections();
    return NextResponse.json({
      connections: results.length,
      created: results.reduce((n, r) => n + r.created, 0),
      updated: results.reduce((n, r) => n + r.updated, 0),
      deleted: results.reduce((n, r) => n + r.deleted, 0),
      skipped: results.reduce((n, r) => n + r.skipped, 0),
      failed: results.reduce((n, r) => n + r.failed, 0),
      // 上限で次回へ回した件数。0 でなければ続けて叩けば進む
      remaining: results.reduce((n, r) => n + r.remaining, 0),
      errors,
    });
  } finally {
    running = false;
  }
}

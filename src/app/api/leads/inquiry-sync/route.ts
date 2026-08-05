/**
 * コーポレートサイトの問い合わせを取り込む入口。NAS のタスクスケジューラから叩く。
 *
 *   docker exec iterra-hub-app wget -qO- --post-data='' \
 *     --header="Authorization: Bearer $INQUIRY_SYNC_CRON_SECRET" \
 *     http://127.0.0.1:3000/api/leads/inquiry-sync
 *
 * コンテナはポートを公開していないので外から到達する経路は無い。
 * それでも合言葉を要求するのは、同一ホスト上の別プロセスから叩けてしまう
 * 状態を残さないため（/api/gmail/sync と同じ考え方）。
 *
 * middleware の認証対象から外してある。認証はここで行う。
 */

import { NextResponse, type NextRequest } from "next/server";

import { bearerMatches } from "@/lib/gmail/secret";
import { getD1Config, queryD1 } from "@/lib/d1";
import {
  toInquiryLead,
  type InquiryRow,
} from "@/lib/leads/inquiry-import";
import { createAdminClient } from "@/lib/supabase/admin";

/** 前回が終わる前に次が来たら見送る。アプリのコンテナは 1 つなのでモジュール変数で足りる */
let running = false;

function getCronSecret(): string | null {
  return process.env.INQUIRY_SYNC_CRON_SECRET?.trim() || null;
}

export async function POST(request: NextRequest) {
  const secret = getCronSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "問い合わせ取込は無効です（INQUIRY_SYNC_CRON_SECRET が未設定）" },
      { status: 503 }
    );
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  if (!getD1Config()) {
    return NextResponse.json(
      { error: "D1 連携が未設定です（CLOUDFLARE_* を確認してください）" },
      { status: 503 }
    );
  }

  if (running) {
    return NextResponse.json({ skipped: "前回の取込が実行中です" });
  }
  running = true;

  try {
    // 全件を読んで、取り込み済みは DB 関数側で弾く。
    // 問い合わせは多くても年に数百件なので全件で足りる。
    // 増えてきたら created_at で絞ること
    const rows = await queryD1<InquiryRow>(
      "SELECT id, form_type, label, email, name, company, tel, source, is_first, detail_json, created_at" +
        " FROM leads ORDER BY created_at"
    );

    if (rows.length === 0) {
      return NextResponse.json({ fetched: 0, created: 0, appended: 0, skipped: 0 });
    }

    const admin = createAdminClient();
    const defaults = await resolveDefaults(admin);
    if ("error" in defaults) {
      return NextResponse.json({ error: defaults.error }, { status: 503 });
    }

    const { data, error } = await admin.rpc("import_inquiry_leads", {
      p_batch: {
        imported_by: defaults.importedBy,
        owner_user_id: defaults.ownerUserId,
        stage_id: defaults.stageId,
        status_id: defaults.statusId,
        lead_source_id: defaults.leadSourceId,
        activity_type_id: defaults.activityTypeId,
        file_name: "D1 corporate-iterra-leads",
      },
      p_rows: rows.map(toInquiryLead),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ fetched: rows.length, ...(data as object) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "取込に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    running = false;
  }
}

type Defaults = {
  importedBy: string;
  ownerUserId: string;
  stageId: string;
  statusId: string | null;
  leadSourceId: string;
  activityTypeId: string;
};

/**
 * 取込に使う既定値をマスタから引く。
 *
 * 担当者は INQUIRY_SYNC_OWNER_EMAIL で指定できる。未設定なら最初の管理者に付ける
 * （担当者不在のリードを作らないため）。
 */
async function resolveDefaults(
  admin: ReturnType<typeof createAdminClient>
): Promise<Defaults | { error: string }> {
  const ownerEmail = process.env.INQUIRY_SYNC_OWNER_EMAIL?.trim();

  const ownerQuery = admin
    .from("crm_users")
    .select("id")
    .eq("is_active", true)
    .order("created_at")
    .limit(1);

  const [owner, stage, source, activityType] = await Promise.all([
    ownerEmail
      ? ownerQuery.eq("email", ownerEmail).maybeSingle()
      : ownerQuery.eq("role", "admin").maybeSingle(),
    // **スラッグで引かない。** スラッグは自動採番の値になったので、
    // 「取込の既定」であることを表す列を見る（20260805000018）
    admin
      .from("lead_stages")
      .select("id")
      .eq("is_inquiry_default", true)
      .is("deleted_at", null)
      .maybeSingle(),
    admin
      .from("lead_sources")
      .select("id")
      .eq("is_inquiry_default", true)
      .is("deleted_at", null)
      .maybeSingle(),
    admin
      .from("lead_customer_activity_types")
      .select("id")
      .eq("code", "form_submit")
      .maybeSingle(),
  ]);

  if (!owner.data) {
    return {
      error: ownerEmail
        ? `担当者が見つかりません（INQUIRY_SYNC_OWNER_EMAIL=${ownerEmail}）`
        : "担当者にする管理者が見つかりません",
    };
  }
  // 「どれを既定にするか」はマスタ管理の設定なので、直し方まで文言にする
  if (!stage.data) {
    return {
      error:
        "取込の既定ステージが設定されていません（マスタ・取込 → リードステージで「問い合わせ取込の既定」を 1 つ選んでください）",
    };
  }
  if (!source.data) {
    return {
      error:
        "取込の既定の流入元が設定されていません（マスタ・取込 → リードソースで「問い合わせ取込の既定」を 1 つ選んでください）",
    };
  }
  if (!activityType.data) {
    return { error: "顧客行動種別「問合せフォーム送信」が見つかりません" };
  }

  // 未対応であることが分かるステータスから始める
  const { data: status } = await admin
    .from("lead_statuses")
    .select("id")
    .eq("stage_id", stage.data.id)
    .eq("code", "not_started")
    .maybeSingle();

  return {
    importedBy: owner.data.id,
    ownerUserId: owner.data.id,
    stageId: stage.data.id,
    statusId: status?.id ?? null,
    leadSourceId: source.data.id,
    activityTypeId: activityType.data.id,
  };
}

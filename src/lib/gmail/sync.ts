/**
 * Gmail からの取り込み。
 *
 * 流れ:
 *   1. 保存済みリフレッシュトークンを復号してアクセストークンを得る
 *   2. 差分（history.list）または初回（messages.list の直近分）で対象 ID を集める
 *   3. 1 通ずつメタデータを取り、記録すべき相手を選別する
 *   4. record_email_message に渡す（複数テーブルへの書き込みは DB 側でまとめる）
 *
 * 書き込みは service_role で行う。email_messages / email_message_contacts には
 * authenticated 向けの INSERT ポリシーが無く、同期は利用者の操作ではなく
 * システムの処理として走るため。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailConfig } from "./config";
import {
  getMessageMetadata,
  listAddedMessageIds,
  listMessageIds,
  refreshAccessToken,
  type GmailMessageMeta,
} from "./client";
import { decryptToken, fromByteaLiteral } from "./crypto";
import { emailDomain, extractParticipants, normalizeEmail } from "./address";

/** 初回・履歴失効時にさかのぼる通数。過去分の一括取り込みはしない方針（設計書 § 20.5） */
const INITIAL_MESSAGE_LIMIT = 50;

/** 1 回の同期で処理する上限。長時間のリクエストにならないよう頭を押さえる */
const MAX_MESSAGES_PER_RUN = 200;

export type SyncResult = {
  connectionId: string;
  emailAddress: string;
  /** 取り込んだ通数（既に記録済みのものは除く） */
  recorded: number;
  /** 記録対象外として飛ばした通数 */
  skipped: number;
  /** 履歴が失効して全件走査にフォールバックしたか */
  fellBackToFullScan: boolean;
};

type ConnectionRow = {
  id: string;
  crm_user_id: string;
  email_address: string;
  refresh_token_enc: string;
  last_history_id: string | null;
  last_synced_at: string | null;
};

/**
 * 1 アカウント分を同期する。
 *
 * 例外は投げずに Error を返す。1 アカウントの失敗で他の同期を止めないため。
 */
export async function syncConnection(
  connectionId: string
): Promise<{ data: SyncResult | null; error: string | null }> {
  const config = getGmailConfig();
  if (!config) return { data: null, error: "Gmail 連携が未設定です" };

  const admin = createAdminClient();

  const { data: conn, error: connError } = await admin
    .from("gmail_connections")
    .select("id, crm_user_id, email_address, refresh_token_enc, last_history_id, last_synced_at")
    .eq("id", connectionId)
    .eq("is_active", true)
    .maybeSingle<ConnectionRow>();

  if (connError) return { data: null, error: connError.message };
  if (!conn) return { data: null, error: "連携が見つかりません" };

  try {
    const refreshToken = decryptToken(
      fromByteaLiteral(conn.refresh_token_enc),
      config.encryptionKey
    );

    const { accessToken } = await refreshAccessToken({
      refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    // 社内アドレスは候補に出さない。連携アドレスのドメインを社内とみなす
    const ownDomains = await collectOwnDomains(admin, conn.email_address);
    const connectedAddresses = await collectConnectedAddresses(admin);

    const { ids, nextHistoryId, fellBack } = await collectTargetIds(
      accessToken,
      conn
    );

    let recorded = 0;
    let skipped = 0;

    for (const id of ids.slice(0, MAX_MESSAGES_PER_RUN)) {
      const meta = await getMessageMetadata(accessToken, id);
      const outcome = await recordMessage(admin, conn, meta, {
        ownDomains,
        connectedAddresses,
      });
      if (outcome === "recorded") recorded += 1;
      else skipped += 1;
    }

    await admin
      .from("gmail_connections")
      .update({
        last_history_id: nextHistoryId ?? conn.last_history_id,
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", conn.id);

    return {
      data: {
        connectionId: conn.id,
        emailAddress: conn.email_address,
        recorded,
        skipped,
        fellBackToFullScan: fellBack,
      },
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "同期に失敗しました";
    // 次に開いたときに理由が分かるよう残す（再連携が要るケースが多い）
    await admin
      .from("gmail_connections")
      .update({ last_error: message })
      .eq("id", conn.id);
    return { data: null, error: message };
  }
}

/**
 * 取り込み対象の ID を決める。
 *
 * - 初回（last_synced_at が無い）: 直近 INITIAL_MESSAGE_LIMIT 通
 * - 通常: history.list の差分
 * - 履歴が失効していた場合: 直近 INITIAL_MESSAGE_LIMIT 通へフォールバック
 */
async function collectTargetIds(
  accessToken: string,
  conn: ConnectionRow
): Promise<{ ids: string[]; nextHistoryId: string | null; fellBack: boolean }> {
  const recent = async () => {
    const { ids } = await listMessageIds(accessToken, {
      maxResults: INITIAL_MESSAGE_LIMIT,
    });
    return ids;
  };

  if (!conn.last_synced_at || !conn.last_history_id) {
    return { ids: await recent(), nextHistoryId: null, fellBack: false };
  }

  const history = await listAddedMessageIds(accessToken, conn.last_history_id);
  if (history.expired) {
    return { ids: await recent(), nextHistoryId: null, fellBack: true };
  }
  return { ids: history.ids, nextHistoryId: history.historyId, fellBack: false };
}

/**
 * 1 通を記録する。記録すべき相手が 1 人もいなければ飛ばす。
 *
 * 社内だけのやり取り・配信メール・自動通知はここで落ちる。
 * 落としたものを候補に溜めると、承認すべき相手が埋もれる。
 */
async function recordMessage(
  admin: ReturnType<typeof createAdminClient>,
  conn: ConnectionRow,
  meta: GmailMessageMeta,
  filter: { ownDomains: string[]; connectedAddresses: string[] }
): Promise<"recorded" | "skipped"> {
  const from = meta.headers["from"] ?? null;
  const to = meta.headers["to"] ?? null;
  const cc = meta.headers["cc"] ?? null;

  const participants = extractParticipants({ from, to, cc }, filter);
  if (participants.length === 0) return "skipped";

  const fromParsed = extractParticipants(
    { from, to: null, cc: null },
    { ownDomains: [], connectedAddresses: [] }
  )[0];
  const fromEmail = normalizeEmail(fromParsed?.email);
  if (!fromEmail) return "skipped";

  // 送信箱にあるものを送信扱いにする。From で判定すると、
  // 連携アドレスがエイリアスの場合に取りこぼす
  const direction = meta.labelIds.includes("SENT") ? "outbound" : "inbound";

  const { error } = await admin.rpc("record_email_message", {
    p_connection_id: conn.id,
    p_gmail_message_id: meta.id,
    p_gmail_thread_id: meta.threadId,
    p_direction: direction,
    // 引数に既定値があるものは null ではなく省略する（生成型が optional のため）。
    // 空文字と「無い」の区別は DB 側の NULLIF が引き受ける
    p_subject: meta.headers["subject"] ?? "",
    p_sent_at: new Date(Number(meta.internalDate)).toISOString(),
    p_from_email: fromEmail,
    p_from_name: fromParsed?.name ?? undefined,
    p_to_emails: parseEmails(to),
    p_cc_emails: parseEmails(cc),
    p_participants: participants.map((p) => ({
      email: p.email,
      name: p.name,
      role: p.role,
    })),
  });

  if (error) throw new Error(`メールの記録に失敗しました: ${error.message}`);
  return "recorded";
}

function parseEmails(header: string | null): string[] {
  return extractParticipants(
    { from: header, to: null, cc: null },
    { ownDomains: [], connectedAddresses: [] }
  )
    .map((p) => normalizeEmail(p.email))
    .filter((e): e is string => e !== null);
}

/**
 * 社内ドメイン。連携アドレスのドメインを社内とみなす。
 * 複数アカウントが繋がっていればすべて対象にする。
 */
async function collectOwnDomains(
  admin: ReturnType<typeof createAdminClient>,
  fallback: string
): Promise<string[]> {
  const { data } = await admin
    .from("gmail_connections")
    .select("email_address")
    .eq("is_active", true);

  const domains = new Set<string>([emailDomain(fallback.toLowerCase())]);
  for (const row of data ?? []) {
    domains.add(emailDomain(row.email_address.toLowerCase()));
  }
  // フリーメールのドメインを社内扱いにすると相手先が全部消える
  return [...domains].filter((d) => d && !FREE_MAIL_DOMAINS.has(d));
}

async function collectConnectedAddresses(
  admin: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  const { data } = await admin
    .from("gmail_connections")
    .select("email_address")
    .eq("is_active", true);
  return (data ?? []).map((r) => r.email_address);
}

/** is_free_email_domain() の判定と揃えている（DB 側は company_domains 用） */
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.co.jp",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "docomo.ne.jp",
  "ezweb.ne.jp",
  "au.com",
  "softbank.ne.jp",
  "me.com",
  "live.jp",
  "msn.com",
]);

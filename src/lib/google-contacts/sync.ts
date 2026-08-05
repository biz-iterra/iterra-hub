/**
 * Google コンタクト同期の本体（Phase 1: CRM → Google の push）。
 *
 * **CRM が正本。CRM 側の変更は自動で Google へ反映する。**
 * 電話帳は「常に最新」であることが目的そのもので、人の確認を挟むと放置され
 * 古い電話帳が残るため（freee と意図的に変えた点。§1.1）。
 *
 * 触るのは**コンタクトグループ「ITERRA CRM」の中だけ**。
 * 利用者の個人的な連絡先には一切触れない。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { toUserMessage } from "@/lib/db-error";
import {
  decryptToken,
  encryptToken,
  fromByteaLiteral,
  toByteaLiteral,
} from "@/lib/gmail/crypto";
import {
  CONTACT_GROUP_NAME,
  getGoogleContactsConfig,
  type GoogleContactsConfig,
} from "./config";
import {
  createContact,
  createContactGroup,
  deleteContact,
  GooglePeopleError,
  listContactGroups,
  modifyGroupMembers,
  refreshAccessToken,
  updateContact,
} from "./client";
import {
  fingerprintSource,
  toGooglePerson,
  UPDATE_PERSON_FIELDS,
  type ContactSource,
} from "./mapping";

/** アクセストークンの残り有効期間がこれ未満ならリフレッシュする */
const TOKEN_REUSE_MARGIN_MS = 5 * 60 * 1000;

/**
 * 1 回の実行で送る上限。
 *
 * People API の書き込みには 1 分あたりの上限がある。初回の全件登録は
 * ここで区切り、**残りは次の実行で進める**（cron が繰り返し呼ぶ）。
 * 1 回で流し切ろうとすると 429 で全体が止まる。
 */
const MAX_PUSH_PER_RUN = 150;

/** 連続で叩かないための間隔 */
const PUSH_INTERVAL_MS = 120;

/** 429 に当たったときの待ち時間（指数バックオフの初期値） */
const BACKOFF_BASE_MS = 2_000;
const MAX_RETRY = 3;

export type GoogleContactsSyncResult = {
  connectionId: string;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
  failed: number;
  /** 上限に当たって次回へ回した件数 */
  remaining: number;
};

type ConnectionRow = {
  id: string;
  crm_user_id: string;
  email_address: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  contact_group_resource: string | null;
};

const CONNECTION_COLUMNS =
  "id, crm_user_id, email_address, refresh_token_enc, access_token_enc, " +
  "access_token_expires_at, contact_group_resource";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * アクセストークンを確保する。
 *
 * 生きていれば復号して再利用し、切れていればリフレッシュして保存する。
 * Google のリフレッシュトークンは**ローテーションしない**ので、freee のような
 * 「保存前に落ちると接続が死ぬ」問題は無い。
 */
async function ensureAccessToken(
  admin: ReturnType<typeof createAdminClient>,
  conn: ConnectionRow,
  config: GoogleContactsConfig
): Promise<string> {
  const expiresAt = conn.access_token_expires_at
    ? new Date(conn.access_token_expires_at).getTime()
    : 0;

  if (conn.access_token_enc && expiresAt - Date.now() > TOKEN_REUSE_MARGIN_MS) {
    return decryptToken(fromByteaLiteral(conn.access_token_enc), config.encryptionKey);
  }

  const refreshToken = decryptToken(
    fromByteaLiteral(conn.refresh_token_enc),
    config.encryptionKey
  );
  const token = await refreshAccessToken({
    refreshToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  await admin
    .from("google_contact_connections")
    .update({
      access_token_enc: toByteaLiteral(
        encryptToken(token.accessToken, config.encryptionKey)
      ),
      access_token_expires_at: new Date(
        Date.now() + token.expiresInSec * 1000
      ).toISOString(),
    })
    .eq("id", conn.id);

  return token.accessToken;
}

/**
 * 「ITERRA CRM」グループを確保する。
 *
 * **同期対象の境界**（§3）。名前で探し、無ければ作る。
 * 利用者が Google 側でグループ名を変えた場合は新しく作り直すことになるが、
 * resourceName を保存しているので通常は名前に依存しない。
 */
async function ensureContactGroup(
  admin: ReturnType<typeof createAdminClient>,
  conn: ConnectionRow,
  accessToken: string
): Promise<string> {
  if (conn.contact_group_resource) return conn.contact_group_resource;

  const groups = await listContactGroups(accessToken);
  const found = groups.find(
    (g) => (g.name ?? g.formattedName) === CONTACT_GROUP_NAME
  );
  const resourceName =
    found?.resourceName ??
    (await createContactGroup({ accessToken, name: CONTACT_GROUP_NAME })).resourceName;

  await admin
    .from("google_contact_connections")
    .update({ contact_group_resource: resourceName })
    .eq("id", conn.id);

  return resourceName;
}

/** 429 / 503 は待って数回だけ試し直す。それ以外はそのまま投げる */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const rateLimited = e instanceof GooglePeopleError && e.isRateLimited;
      if (!rateLimited || attempt >= MAX_RETRY) throw e;
      await sleep(BACKOFF_BASE_MS * 2 ** attempt);
    }
  }
}

/**
 * 1 接続分を同期する。
 *
 * 例外は投げずに error を返す（cron からの実行で他の接続を巻き込まないため）。
 * 失敗は last_error に残し、成功したら消す。
 */
export async function syncGoogleContactsConnection(
  connectionId: string,
  options: { actorId?: string } = {}
): Promise<{ data: GoogleContactsSyncResult | null; error: string | null }> {
  const config = getGoogleContactsConfig();
  if (!config) return { data: null, error: "Google コンタクト連携が未設定です" };

  const admin = createAdminClient();

  const { data: conn, error: connError } = await admin
    .from("google_contact_connections")
    .select(CONNECTION_COLUMNS)
    .eq("id", connectionId)
    .eq("is_active", true)
    .maybeSingle<ConnectionRow>();

  if (connError) {
    return {
      data: null,
      error: toUserMessage(connError, { entityLabel: "Google コンタクト連携" }),
    };
  }
  if (!conn) return { data: null, error: "Google との接続が見つかりません" };

  const result: GoogleContactsSyncResult = {
    connectionId: conn.id,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
  };

  try {
    const accessToken = await ensureAccessToken(admin, conn, config);
    const groupResource = await ensureContactGroup(admin, conn, accessToken);

    const { data: targets, error: targetsError } = await admin.rpc(
      "list_google_push_targets",
      { p_connection_id: conn.id }
    );
    if (targetsError) {
      throw new Error(
        toUserMessage(targetsError, { entityLabel: "Google コンタクト連携" })
      );
    }

    const rows = (targets ?? []) as {
      contact_id: string;
      link_id: string | null;
      resource_name: string | null;
      etag: string | null;
      fingerprint: string | null;
      is_deleted: boolean;
    }[];

    /** このまわりで作った連絡先。まとめてグループへ入れる */
    const toGroup: string[] = [];
    let pushed = 0;

    for (const row of rows) {
      if (pushed >= MAX_PUSH_PER_RUN) {
        result.remaining = rows.length - rows.indexOf(row);
        break;
      }

      // --- CRM で消えた連絡先は Google からも消す ---
      if (row.is_deleted) {
        if (!row.resource_name) {
          result.skipped++;
          continue;
        }
        try {
          await withRetry(() =>
            deleteContact({ accessToken, resourceName: row.resource_name! })
          );
          await recordPush(admin, conn.id, row.contact_id, row.resource_name, null, null,
            "delete", true, null, options.actorId);
          result.deleted++;
        } catch (e) {
          const message = e instanceof Error ? e.message : "削除に失敗しました";
          await recordPush(admin, conn.id, row.contact_id, row.resource_name, null, null,
            "delete", false, message, options.actorId);
          result.failed++;
        }
        pushed++;
        await sleep(PUSH_INTERVAL_MS);
        continue;
      }

      // --- 送る値をその場で引き直す ---
      const { data: sourceJson } = await admin.rpc("get_contact_google_source", {
        p_contact_id: row.contact_id,
      });
      if (!sourceJson) {
        result.skipped++;
        continue;
      }
      const source = sourceJson as unknown as ContactSource;
      const fingerprint = fingerprintSource(source);

      // 内容が変わっていなければ送らない（§5.2）
      if (row.link_id && row.fingerprint === fingerprint) {
        result.skipped++;
        continue;
      }

      const person = toGooglePerson(source);

      try {
        if (!row.resource_name) {
          const created = await withRetry(() => createContact({ accessToken, person }));
          await recordPush(admin, conn.id, row.contact_id, created.resourceName,
            created.etag ?? null, fingerprint, "create", true, null, options.actorId);
          toGroup.push(created.resourceName);
          result.created++;
        } else {
          // **etag が必須。** 無ければ次の取り込みまで待つ（黙って上書きしない）
          if (!row.etag) {
            result.skipped++;
            continue;
          }
          const updated = await withRetry(() =>
            updateContact({
              accessToken,
              resourceName: row.resource_name!,
              etag: row.etag!,
              person,
              updateFields: UPDATE_PERSON_FIELDS,
            })
          );
          await recordPush(admin, conn.id, row.contact_id, updated.resourceName,
            updated.etag ?? null, fingerprint, "update", true, null, options.actorId);
          result.updated++;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "反映に失敗しました";
        // **競合（Google 側で変わっていた）は上書きしない。**
        // Phase 2 の差分画面で人が解決する。ここでは理由を残すだけ
        await recordPush(admin, conn.id, row.contact_id, row.resource_name, null, null,
          row.resource_name ? "update" : "create", false, message, options.actorId);
        result.failed++;
      }

      pushed++;
      await sleep(PUSH_INTERVAL_MS);
    }

    // 作った連絡先をまとめてグループへ入れる（1 回 1000 件まで）
    for (let i = 0; i < toGroup.length; i += 500) {
      await withRetry(() =>
        modifyGroupMembers({
          accessToken,
          groupResourceName: groupResource,
          add: toGroup.slice(i, i + 500),
        })
      );
    }

    await admin
      .from("google_contact_connections")
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq("id", conn.id);

    return { data: result, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Google コンタクトの同期に失敗しました";
    await admin
      .from("google_contact_connections")
      .update({ last_error: message })
      .eq("id", conn.id);
    return { data: null, error: message };
  }
}

/** リンクの更新とログを 1 トランザクションで行う（DB 関数側にまとめてある） */
async function recordPush(
  admin: ReturnType<typeof createAdminClient>,
  connectionId: string,
  contactId: string,
  resourceName: string | null,
  etag: string | null,
  fingerprint: string | null,
  operation: "create" | "update" | "delete",
  succeeded: boolean,
  error: string | null,
  actorId: string | undefined
): Promise<void> {
  await admin.rpc("record_google_push", {
    p_connection_id: connectionId,
    p_contact_id: contactId,
    p_resource_name: resourceName ?? undefined,
    p_etag: etag ?? undefined,
    p_fingerprint: fingerprint ?? undefined,
    p_operation: operation,
    p_succeeded: succeeded,
    p_error: error ?? undefined,
    p_actor: actorId,
  });
}

/** 有効な接続をすべて同期する（定期実行から呼ぶ） */
export async function syncAllGoogleContactConnections(): Promise<{
  results: GoogleContactsSyncResult[];
  errors: string[];
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_contact_connections")
    .select("id")
    .eq("is_active", true);

  const results: GoogleContactsSyncResult[] = [];
  const errors: string[] = [];

  for (const row of (data ?? []) as { id: string }[]) {
    const { data: result, error } = await syncGoogleContactsConnection(row.id);
    if (result) results.push(result);
    if (error) errors.push(error);
  }

  return { results, errors };
}

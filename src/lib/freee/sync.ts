/**
 * freee 取引先の同期本体。
 *
 * 流れ: アクセストークン確保 → Partner 全件/差分取得 →
 *        upsert_freee_partners（DB 関数）へ JSONB で一括反映。
 *
 * **freee 側には一切書かない**（読み取り専用の同期。設計の決定事項）。
 *
 * トークンの扱いが Gmail と違う:
 *   freee のリフレッシュトークンはローテーション式（使うと古い値が失効する）。
 *   「リフレッシュ → 保存の前に落ちる」と接続が死ぬため、
 *   ① アクセストークンが生きていれば再利用してリフレッシュ自体を減らす
 *   ② リフレッシュしたら**新トークンを保存してから** API を呼ぶ
 *   の順序を厳守する。
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { toUserMessage } from "@/lib/db-error";
import {
  decryptToken,
  encryptToken,
  fromByteaLiteral,
  toByteaLiteral,
} from "@/lib/gmail/crypto";
import { getFreeeConfig, type FreeeConfig } from "./config";
import { fetchPartners, refreshTokens } from "./client";
import { toPartnerRow } from "./partner";

/** アクセストークンの残り有効期間がこれ未満ならリフレッシュする */
const TOKEN_REUSE_MARGIN_MS = 5 * 60 * 1000;

export type FreeeSyncResult = {
  connectionId: string;
  freeeCompanyId: number;
  fetched: number;
  upserted: number;
  autoLinked: number;
  markedDeleted: number;
  full: boolean;
};

type ConnectionRow = {
  id: string;
  freee_company_id: number;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  last_synced_at: string | null;
};

/**
 * アクセストークンを確保する。
 *
 * 生きていれば復号して再利用。切れていればリフレッシュし、
 * **新しいトークン一式を DB に保存し切ってから**返す。
 */
async function ensureAccessToken(
  admin: ReturnType<typeof createAdminClient>,
  conn: ConnectionRow,
  config: FreeeConfig
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
  const token = await refreshTokens({
    refreshToken,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  // ローテーション式: ここで保存に失敗したら旧トークンはもう使えない。
  // 例外を投げて同期を止め、保存できていない新トークンで先へ進まない
  const { error } = await admin
    .from("freee_connections")
    .update({
      refresh_token_enc: toByteaLiteral(
        encryptToken(token.refreshToken, config.encryptionKey)
      ),
      access_token_enc: toByteaLiteral(
        encryptToken(token.accessToken, config.encryptionKey)
      ),
      access_token_expires_at: new Date(
        Date.now() + token.expiresInSec * 1000
      ).toISOString(),
    })
    .eq("id", conn.id);
  if (error) {
    throw new Error(
      `freee のトークンを保存できませんでした。再接続が必要になる可能性があります。${toUserMessage(error, { entityLabel: "freee 連携" })}`
    );
  }

  return token.accessToken;
}

/** 差分取得の起点。日付粒度なので前回同期日の 1 日前から取り直して取りこぼしを防ぐ */
function startUpdateDateFrom(lastSyncedAt: string | null): string | undefined {
  if (!lastSyncedAt) return undefined; // 初回は全件
  const d = new Date(lastSyncedAt);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 1 接続分を同期する。
 *
 * 例外は投げずに error を返す（cron からの実行で他処理を巻き込まないため）。
 * 失敗は last_error に残し、成功したら消す。
 */
export async function syncFreeeConnection(
  connectionId: string,
  options: { full?: boolean } = {}
): Promise<{ data: FreeeSyncResult | null; error: string | null }> {
  const config = getFreeeConfig();
  if (!config) return { data: null, error: "freee 連携が未設定です" };

  const admin = createAdminClient();

  const { data: conn, error: connError } = await admin
    .from("freee_connections")
    .select(
      "id, freee_company_id, refresh_token_enc, access_token_enc, access_token_expires_at, last_synced_at"
    )
    .eq("id", connectionId)
    .eq("is_active", true)
    .maybeSingle<ConnectionRow>();

  if (connError) {
    return { data: null, error: toUserMessage(connError, { entityLabel: "freee 連携" }) };
  }
  if (!conn) return { data: null, error: "freee との接続が見つかりません" };

  // 全件同期（削除検出）か差分か
  const full = options.full === true || !conn.last_synced_at;

  try {
    const accessToken = await ensureAccessToken(admin, conn, config);

    const partners = await fetchPartners({
      accessToken,
      freeeCompanyId: conn.freee_company_id,
      startUpdateDate: full ? undefined : startUpdateDateFrom(conn.last_synced_at),
    });

    const { data: result, error: rpcError } = await admin.rpc("upsert_freee_partners", {
      p_freee_company_id: conn.freee_company_id,
      p_rows: partners.map(toPartnerRow),
      p_full: full,
    });
    if (rpcError) {
      throw new Error(toUserMessage(rpcError, { entityLabel: "freee 取引先" }));
    }

    const summary = result as {
      upserted: number;
      auto_linked: number;
      marked_deleted: number;
    };

    await admin
      .from("freee_connections")
      .update({
        last_synced_at: new Date().toISOString(),
        ...(full ? { last_full_synced_at: new Date().toISOString() } : {}),
        last_error: null,
      })
      .eq("id", conn.id);

    return {
      data: {
        connectionId: conn.id,
        freeeCompanyId: conn.freee_company_id,
        fetched: partners.length,
        upserted: summary.upserted,
        autoLinked: summary.auto_linked,
        markedDeleted: summary.marked_deleted,
        full,
      },
      error: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "freee の同期に失敗しました";
    // 失敗の理由を接続に残す（管理画面が表示し、再接続の要否を判断できるように）
    await admin
      .from("freee_connections")
      .update({ last_error: message })
      .eq("id", conn.id);
    return { data: null, error: message };
  }
}

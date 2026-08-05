/**
 * freee 取引先の同期本体。
 *
 * 流れ: アクセストークン確保 → Partner 全件/差分取得 →
 *        upsert_freee_partners（DB 関数）へ JSONB で一括反映。
 *
 * 取り込みは freee → CRM の一方向。**freee への書き込みは pushPartnerToFreee だけ**が行い、
 * 画面で人が確定したときにしか呼ばれない（§26）。
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
import {
  createPartner,
  fetchPartners,
  refreshTokens,
  updatePartner,
  type FreeePartnerCreatePayload,
  type FreeePartnerPayload,
} from "./client";
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

/**
 * CRM の値を freee へ書く。
 *
 * **画面で人が確定した項目だけ**を送る（自動では呼ばない）。
 * 送信の成否は必ず freee_sync_logs に残す。会計データを触る操作なので、
 * 「送ったが弾かれた」を後から追えないと原因が分からなくなる。
 *
 * **PUT の戻り値（更新後の取引先）でミラーを更新する。** 捨てると次の同期まで
 * 同じ差分が残り、送ったのに「反映されていない」ように見える（T-0040）。
 */
export async function pushPartnerToFreee(params: {
  partnerId: string;
  /** 送る項目と値。差分画面で CRM 側を選んだものだけが入る */
  payload: FreeePartnerPayload;
  /** 記録用。{"name": {"from": "...", "to": "..."}} */
  changes: Record<string, { from: unknown; to: unknown }>;
  actorId: string;
}): Promise<{ error: string | null }> {
  const config = getFreeeConfig();
  if (!config) return { error: "freee 連携が未設定です" };

  const admin = createAdminClient();

  const { data: partner } = await admin
    .from("freee_partners")
    .select("id, freee_company_id, freee_partner_id, name")
    .eq("id", params.partnerId)
    .maybeSingle();
  if (!partner) return { error: "freee 取引先が見つかりません" };

  const { data: conn } = await admin
    .from("freee_connections")
    .select(
      "id, freee_company_id, refresh_token_enc, access_token_enc, access_token_expires_at, last_synced_at"
    )
    .eq("freee_company_id", partner.freee_company_id)
    .eq("is_active", true)
    .maybeSingle<ConnectionRow>();
  if (!conn) return { error: "freee との接続が見つかりません" };

  const record = async (succeeded: boolean, error: string | null) => {
    await admin.rpc("record_freee_push", {
      p_partner_id: params.partnerId,
      p_changes: params.changes as never,
      p_succeeded: succeeded,
      p_error: error ?? undefined,
      p_actor: params.actorId,
    });
  };

  try {
    const accessToken = await ensureAccessToken(admin, conn, config);
    const updated = await updatePartner({
      accessToken,
      freeeCompanyId: partner.freee_company_id,
      freeePartnerId: partner.freee_partner_id,
      payload: {
        ...params.payload,
        // **name は毎回必須**（省くと freee が「name が指定されていません。」で 400）。
        // 名称を変えない回は、freee 側の現在の名称をそのまま送り返す
        name: params.payload.name ?? partner.name,
      },
    });
    await record(true, null);

    // 更新後の姿でミラーを差し替える。`p_full` は false のまま
    // （true にすると、この 1 件に含まれない取引先が全部「freee 側で削除済み」になる）。
    // 自動紐付けは link_status = 'unlinked' の行しか触らないので、
    // 紐付け済みのこの行に対しては値の更新だけが起きる
    const { error: mirrorError } = await admin.rpc("upsert_freee_partners", {
      p_freee_company_id: partner.freee_company_id,
      p_rows: [toPartnerRow(updated)],
      p_full: false,
    });
    if (mirrorError) {
      // **freee への書き込みは成功している。** 失敗として返すと送り直しを招くので、
      // 何が済んで何が済んでいないかを文言で分ける
      return {
        error:
          "freee への反映は成功しましたが、CRM 側の控えを更新できませんでした。" +
          "同期を実行すると差分の表示が最新になります。" +
          toUserMessage(mirrorError, { entityLabel: "freee 取引先" }),
      };
    }
    return { error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "freee への書き込みに失敗しました";
    await record(false, message);
    return { error: message };
  }
}

/**
 * CRM の事業者を freee の取引先として**新しく登録する**。
 *
 * 更新では取引先コードを入れられないため、コードを載せられるのはこの経路だけ
 * （§26.8）。POST が通ったら、同じ相手を二度作らないよう
 * **必ずミラーへ入れて紐付けまで済ませる**（DB 関数 1 本にまとめてある）。
 *
 * 失敗しても `freee_sync_logs` には残せない。取引先がまだ無く
 * `freee_partner_id` を埋められないため。理由は呼び出し元が画面に出す。
 */
export async function createFreeePartnerForCompany(params: {
  companyId: string;
  payload: FreeePartnerCreatePayload;
  actorId: string;
}): Promise<{ data: { partnerId: string } | null; error: string | null }> {
  const config = getFreeeConfig();
  if (!config) return { data: null, error: "freee 連携が未設定です" };

  const admin = createAdminClient();

  const { data: conn, error: connError } = await admin
    .from("freee_connections")
    .select(
      "id, freee_company_id, refresh_token_enc, access_token_enc, access_token_expires_at, last_synced_at"
    )
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle<ConnectionRow>();

  if (connError) {
    return { data: null, error: toUserMessage(connError, { entityLabel: "freee 連携" }) };
  }
  if (!conn) return { data: null, error: "freee との接続が見つかりません" };

  try {
    const accessToken = await ensureAccessToken(admin, conn, config);

    const created = await createPartner({
      accessToken,
      freeeCompanyId: conn.freee_company_id,
      payload: params.payload,
    });

    const { data: partnerId, error: rpcError } = await admin.rpc(
      "link_created_freee_partner",
      {
        p_freee_company_id: conn.freee_company_id,
        p_row: toPartnerRow(created) as never,
        p_company_id: params.companyId,
        p_actor: params.actorId,
      }
    );

    if (rpcError) {
      // **freee 側には既に作られている。** 黙って失敗にすると、作り直して
      // 二重登録になる。作られた取引先の ID を文言に残して追えるようにする
      return {
        data: null,
        error:
          `freee に取引先（ID: ${created.id}）を作りましたが、CRM 側の紐付けに失敗しました。` +
          `同期を実行して紐付けを確認してください。` +
          toUserMessage(rpcError, { entityLabel: "freee 取引先" }),
      };
    }

    return { data: { partnerId: partnerId as string }, error: null };
  } catch (e) {
    return {
      data: null,
      error: e instanceof Error ? e.message : "freee への登録に失敗しました",
    };
  }
}

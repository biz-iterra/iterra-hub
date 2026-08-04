/**
 * freee 連携のコールバック。
 *
 * 認可コードをトークンに交換し、暗号化して保存する。
 * 暗号化はアプリ側で済ませ、DB へはバイト列だけを渡す（鍵を DB に送らない）。
 *
 * **再接続でも行を作り直さない。** freee_partners の紐付けが
 * freee_company_id を親キーにしているため、接続行を作り直しても紐付けは
 * 生き残るが、接続の履歴（いつから繋いでいるか）を無用に失わないよう
 * 同じ事業所なら UPDATE する（freee_connections は freee_company_id が UNIQUE）。
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreeeConfig, freeeRedirectUri } from "@/lib/freee/config";
import { exchangeCode, getCompanies } from "@/lib/freee/client";
import { encryptToken, toByteaLiteral } from "@/lib/gmail/crypto";
import { safeEqual } from "@/lib/gmail/secret";
import { resolveExternalOrigin } from "@/lib/app-origin";
import { toUserMessage } from "@/lib/db-error";
import { OAUTH_STATE_COOKIE } from "../auth/route";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const origin = resolveExternalOrigin(request.nextUrl.origin);
  const base = origin ?? request.nextUrl.origin;

  const back = (message: string) =>
    NextResponse.redirect(
      new URL(`/admin/freee?freee_error=${encodeURIComponent(message)}`, base)
    );
  const done = (companyName: string) =>
    NextResponse.redirect(
      new URL(`/admin/freee?freee_connected=${encodeURIComponent(companyName)}`, base)
    );

  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  // 一度きりの値なので、成否にかかわらず消す
  store.delete(OAUTH_STATE_COOKIE);

  // 利用者が認可画面で「キャンセル」した場合もここへ来る
  const oauthError = params.get("error");
  if (oauthError) {
    return back(
      oauthError === "access_denied"
        ? "連携がキャンセルされました"
        : `freee から拒否されました: ${oauthError}`
    );
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return back("認可コードが受け取れませんでした");
  if (!expectedState || !safeEqual(state, expectedState)) {
    return back("認可のリクエストが確認できませんでした。もう一度お試しください");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const { data: me } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") {
    return back("freee 連携の操作は admin だけが行えます");
  }

  const config = getFreeeConfig();
  if (!config) return back("freee 連携が未設定です");

  if (!origin) {
    return back(
      "公開 URL を特定できません（APP_ORIGIN に https://hub.iterra.online を設定してください）"
    );
  }

  try {
    const token = await exchangeCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: freeeRedirectUri(origin),
    });

    const companies = await getCompanies(token.accessToken);
    if (companies.length === 0) {
      return back("freee の事業所が取得できませんでした");
    }
    // 現状 ITERRA は 1 事業所。複数ある場合は先頭を繋ぐ
    // （選択 UI は必要になってから。docs のfreee 連携章に制約として明記）
    const company = companies[0];

    const now = new Date();
    const payload = {
      crm_user_id: user.id,
      freee_company_id: company.id,
      freee_company_name: company.display_name ?? company.name ?? null,
      refresh_token_enc: toByteaLiteral(
        encryptToken(token.refreshToken, config.encryptionKey)
      ),
      access_token_enc: toByteaLiteral(
        encryptToken(token.accessToken, config.encryptionKey)
      ),
      access_token_expires_at: new Date(
        now.getTime() + token.expiresInSec * 1000
      ).toISOString(),
      granted_scope: token.scope,
      last_error: null,
      is_active: true,
    };

    // freee_company_id が UNIQUE。既にあれば繋ぎ直しとして更新する
    const { data: existing } = await supabase
      .from("freee_connections")
      .select("id")
      .eq("freee_company_id", company.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("freee_connections")
        .update(payload)
        .eq("id", existing.id);
      if (error) {
        return back(`連携の保存に失敗しました。${toUserMessage(error, { entityLabel: "freee 連携" })}`);
      }
    } else {
      const { error } = await supabase.from("freee_connections").insert(payload);
      if (error) {
        return back(`連携の保存に失敗しました。${toUserMessage(error, { entityLabel: "freee 連携" })}`);
      }
    }

    return done(payload.freee_company_name ?? String(company.id));
  } catch (e) {
    return back(e instanceof Error ? e.message : "連携に失敗しました");
  }
}

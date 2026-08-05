/**
 * Google コンタクト連携のコールバック。
 *
 * 認可コードをトークンに交換し、リフレッシュトークンを暗号化して保存する。
 * 暗号化はアプリ側で済ませ、DB へはバイト列だけを渡す（鍵を DB に送らない）。
 *
 * **ここで会社アカウントかを検証する。** 認可 URL の `hd` は「そのドメインを
 * 選ばせるヒント」に過ぎず強制力が無い。Google 側の内部アプリ設定と合わせて
 * 二重に確認する（§2）。
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGoogleContactsConfig,
  googleContactsRedirectUri,
  GOOGLE_CONTACTS_SCOPE,
} from "@/lib/google-contacts/config";
import { exchangeCode, readIdToken } from "@/lib/google-contacts/client";
import { encryptToken, toByteaLiteral } from "@/lib/gmail/crypto";
import { safeEqual } from "@/lib/gmail/secret";
import { resolveExternalOrigin } from "@/lib/app-origin";
import { GOOGLE_CONTACTS_STATE_COOKIE } from "../auth/route";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // 認可時と同じ redirect_uri でなければトークン交換は通らない
  const origin = resolveExternalOrigin(request.nextUrl.origin);
  const base = origin ?? request.nextUrl.origin;

  const back = (message: string) =>
    NextResponse.redirect(
      new URL(`/profile?google_contacts_error=${encodeURIComponent(message)}`, base)
    );
  const done = (email: string) =>
    NextResponse.redirect(
      new URL(`/profile?google_contacts_connected=${encodeURIComponent(email)}`, base)
    );

  const store = await cookies();
  const expectedState = store.get(GOOGLE_CONTACTS_STATE_COOKIE)?.value;
  // 一度きりの値なので、成否にかかわらず消す
  store.delete(GOOGLE_CONTACTS_STATE_COOKIE);

  const oauthError = params.get("error");
  if (oauthError) {
    return back(
      oauthError === "access_denied"
        ? "連携がキャンセルされました"
        : `Google から拒否されました: ${oauthError}`
    );
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!expectedState || !state || !safeEqual(expectedState, state)) {
    return back("認可のリクエストが確認できませんでした。もう一度お試しください");
  }
  if (!code) return back("認可コードが受け取れませんでした");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", base));

  const config = getGoogleContactsConfig();
  if (!config) return back("Google コンタクト連携が未設定です");
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
      redirectUri: googleContactsRedirectUri(origin),
    });

    if (!token.refreshToken) {
      return back(
        "リフレッシュトークンが返りませんでした。Google アカウントの「サードパーティ製アプリ」から本アプリの許可を取り消して、もう一度お試しください"
      );
    }

    // 要求より広い権限が付いていないか確認する（Gmail 連携と同じ監査）
    const scopes = token.scope.split(/\s+/).filter(Boolean);
    const contactScopes = scopes.filter((s) => s.includes("/auth/contacts"));
    const unexpected = contactScopes.filter((s) => s !== GOOGLE_CONTACTS_SCOPE);
    if (unexpected.length > 0) {
      return back(
        `想定より広い権限が許可されました（${unexpected.join(", ")}）。連携を中止しました`
      );
    }

    if (!token.idToken) {
      return back("アカウント情報が取得できませんでした。もう一度お試しください");
    }
    const identity = readIdToken(token.idToken);
    if (!identity.email) {
      return back("アカウントのメールアドレスが取得できませんでした");
    }

    // **会社アカウントの検証。** 個人 Gmail には同期させない（§2）
    if (config.allowedDomain) {
      const emailDomain = identity.email.split("@")[1] ?? "";
      if (identity.hd !== config.allowedDomain && emailDomain !== config.allowedDomain) {
        return back(
          `会社のアカウント（@${config.allowedDomain}）で連携してください。個人アカウントには同期できません`
        );
      }
    }

    const enc = toByteaLiteral(encryptToken(token.refreshToken, config.encryptionKey));
    const accessEnc = toByteaLiteral(
      encryptToken(token.accessToken, config.encryptionKey)
    );
    const expiresAt = new Date(Date.now() + token.expiresInSec * 1000).toISOString();

    // 同じアドレスの連携が既にあれば繋ぎ直しとして更新する
    // （(lower(email_address)) WHERE is_active の一意制約があるため INSERT はできない）
    const { data: existing } = await supabase
      .from("google_contact_connections")
      .select("id")
      .eq("crm_user_id", user.id)
      .ilike("email_address", identity.email)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("google_contact_connections")
        .update({
          refresh_token_enc: enc,
          access_token_enc: accessEnc,
          access_token_expires_at: expiresAt,
          granted_scope: token.scope,
          hd_domain: identity.hd,
          last_error: null,
          is_active: true,
        })
        .eq("id", existing.id);
      if (error) return back(`連携の保存に失敗しました: ${error.message}`);
    } else {
      const { error } = await supabase.from("google_contact_connections").insert({
        crm_user_id: user.id,
        email_address: identity.email,
        hd_domain: identity.hd,
        refresh_token_enc: enc,
        access_token_enc: accessEnc,
        access_token_expires_at: expiresAt,
        granted_scope: token.scope,
      });
      if (error) return back(`連携の保存に失敗しました: ${error.message}`);
    }

    return done(identity.email);
  } catch (e) {
    return back(e instanceof Error ? e.message : "連携に失敗しました");
  }
}

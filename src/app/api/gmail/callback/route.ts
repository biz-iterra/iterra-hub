/**
 * Gmail 連携のコールバック。
 *
 * 認可コードをトークンに交換し、リフレッシュトークンを暗号化して保存する。
 * 暗号化はアプリ側で済ませ、DB へはバイト列だけを渡す（鍵を DB に送らない）。
 */

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGmailConfig, gmailRedirectUri, GMAIL_SCOPE } from "@/lib/gmail/config";
import { exchangeCode, getProfile } from "@/lib/gmail/client";
import { encryptToken, toByteaLiteral } from "@/lib/gmail/crypto";
import { safeEqual } from "@/lib/gmail/secret";
import { resolveExternalOrigin } from "@/lib/app-origin";
import { OAUTH_STATE_COOKIE } from "../auth/route";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  // 画面内のリダイレクトはリクエスト基準でよい（Next が相対 URL に畳む）
  const back = (message: string) =>
    NextResponse.redirect(
      new URL(`/profile?gmail_error=${encodeURIComponent(message)}`, request.url)
    );
  const done = (email: string) =>
    NextResponse.redirect(
      new URL(
        `/profile?gmail_connected=${encodeURIComponent(email)}`,
        request.url
      )
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
        : `Google から拒否されました: ${oauthError}`
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
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const config = getGmailConfig();
  if (!config) return back("Gmail 連携が未設定です");

  // 認可時と同じ redirect_uri でなければトークン交換は通らない
  const origin = resolveExternalOrigin(request.nextUrl.origin);
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
      redirectUri: gmailRedirectUri(origin),
    });

    // prompt=consent を付けているので通常は返るが、返らなければ保存できない。
    // ここで弾かないと「繋がったのに同期できない」状態になる
    if (!token.refreshToken) {
      return back(
        "リフレッシュトークンが取得できませんでした。Google アカウントの「サードパーティ アプリ」から本アプリのアクセス権を削除してから、もう一度お試しください"
      );
    }

    // 要求より広い権限が付いていないか確認する。gmail.metadata だけを想定しており、
    // 本文を読める権限が紛れ込んでいたら設計の前提が崩れる
    const scopes = token.scope.split(/\s+/).filter(Boolean);
    const gmailScopes = scopes.filter((s) => s.includes("/auth/gmail"));
    const unexpected = gmailScopes.filter((s) => s !== GMAIL_SCOPE);
    if (unexpected.length > 0) {
      return back(
        `想定より広い権限が許可されました（${unexpected.join(", ")}）。連携を中止しました`
      );
    }

    const profile = await getProfile(token.accessToken);
    const enc = toByteaLiteral(encryptToken(token.refreshToken, config.encryptionKey));

    // 同じアドレスの連携が既にあれば繋ぎ直しとして更新する。
    // (lower(email_address)) WHERE is_active の一意制約があるため INSERT はできない
    const { data: existing } = await supabase
      .from("gmail_connections")
      .select("id")
      .eq("crm_user_id", user.id)
      .ilike("email_address", profile.emailAddress)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("gmail_connections")
        .update({
          refresh_token_enc: enc,
          granted_scope: token.scope,
          last_error: null,
          is_active: true,
        })
        .eq("id", existing.id);
      if (error) return back(`連携の保存に失敗しました: ${error.message}`);
    } else {
      const { error } = await supabase.from("gmail_connections").insert({
        crm_user_id: user.id,
        email_address: profile.emailAddress,
        refresh_token_enc: enc,
        granted_scope: token.scope,
        // 初回同期の起点。これ以降に届いたものを差分で拾う
        last_history_id: profile.historyId,
      });
      if (error) return back(`連携の保存に失敗しました: ${error.message}`);
    }

    return done(profile.emailAddress);
  } catch (e) {
    return back(e instanceof Error ? e.message : "連携に失敗しました");
  }
}

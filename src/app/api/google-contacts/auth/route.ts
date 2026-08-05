/**
 * Google コンタクト連携の開始。Google の認可画面へ送る。
 *
 * CSRF 対策として state を発行し、Cookie に控えてコールバックで照合する。
 * これが無いと、攻撃者の認可コードを踏ませて別アカウントを繋がされる。
 *
 * **Gmail 連携とは別の OAuth クライアント**を使う（会社アカウント限定に
 * するため専用プロジェクトを内部アプリにしている。§2）。
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getGoogleContactsConfig,
  googleContactsRedirectUri,
} from "@/lib/google-contacts/config";
import { buildAuthUrl } from "@/lib/google-contacts/client";
import { resolveExternalOrigin } from "@/lib/app-origin";

export const GOOGLE_CONTACTS_STATE_COOKIE = "google_contacts_oauth_state";

export async function GET(request: NextRequest) {
  // Route Handler の NextResponse.redirect は絶対 URL をそのまま Location に
  // 入れるため、request.url 基準だと 0.0.0.0 へ飛ばしてしまう（src/lib/app-origin.ts）
  const origin = resolveExternalOrigin(request.nextUrl.origin);
  const base = origin ?? request.nextUrl.origin;

  const back = (message: string) =>
    NextResponse.redirect(
      new URL(`/profile?google_contacts_error=${encodeURIComponent(message)}`, base)
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", base));
  }

  const config = getGoogleContactsConfig();
  if (!config) {
    return back(
      "Google コンタクト連携が未設定です（GOOGLE_CONTACTS_CLIENT_ID / CLIENT_SECRET / TOKEN_ENCRYPTION_KEY）"
    );
  }

  if (!origin) {
    return back(
      "公開 URL を特定できません（APP_ORIGIN に https://hub.iterra.online を設定してください）"
    );
  }

  const state = randomBytes(32).toString("base64url");
  const store = await cookies();
  store.set(GOOGLE_CONTACTS_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // 外部からのリダイレクトで戻るため strict にはできない
    secure: origin.startsWith("https://"),
    path: "/api/google-contacts",
    maxAge: 600,
  });

  return NextResponse.redirect(
    buildAuthUrl({
      clientId: config.clientId,
      redirectUri: googleContactsRedirectUri(origin),
      state,
      // 会社アカウントを選ばせるヒント。**強制ではない**のでコールバックで検証する
      allowedDomain: config.allowedDomain,
    })
  );
}

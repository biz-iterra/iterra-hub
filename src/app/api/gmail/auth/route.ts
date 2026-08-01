/**
 * Gmail 連携の開始。Google の認可画面へ送る。
 *
 * CSRF 対策として state を発行し、Cookie に控えてコールバックで照合する。
 * これが無いと、攻撃者の認可コードを踏ませて別アカウントを繋がされる。
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGmailConfig, gmailRedirectUri } from "@/lib/gmail/config";
import { buildAuthUrl } from "@/lib/gmail/client";
import { resolveExternalOrigin } from "@/lib/app-origin";

export const OAUTH_STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: NextRequest) {
  // 画面内のリダイレクトはリクエスト基準でよい（Next が相対 URL に畳む）
  const back = (message: string) =>
    NextResponse.redirect(
      new URL(`/profile?gmail_error=${encodeURIComponent(message)}`, request.url)
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const config = getGmailConfig();
  if (!config) {
    return back(
      "Gmail 連携が未設定です（GOOGLE_OAUTH_CLIENT_ID / SECRET / GMAIL_TOKEN_ENCRYPTION_KEY）"
    );
  }

  // Google へ渡す redirect_uri はリクエストからは組めない（§ src/lib/app-origin.ts）
  const origin = resolveExternalOrigin(request.nextUrl.origin);
  if (!origin) {
    return back(
      "公開 URL を特定できません（APP_ORIGIN に https://hub.iterra.online を設定してください）"
    );
  }

  const state = randomBytes(32).toString("base64url");
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // 外部からのリダイレクトで戻るため strict にはできない
    secure: origin.startsWith("https://"),
    path: "/api/gmail",
    maxAge: 600, // 認可画面での操作にかかる程度。長く残さない
  });

  return NextResponse.redirect(
    buildAuthUrl({
      clientId: config.clientId,
      redirectUri: gmailRedirectUri(origin),
      state,
    })
  );
}

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

export const OAUTH_STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (message: string) =>
    NextResponse.redirect(
      `${origin}/profile?gmail_error=${encodeURIComponent(message)}`
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const config = getGmailConfig();
  if (!config) {
    return back(
      "Gmail 連携が未設定です（GOOGLE_OAUTH_CLIENT_ID / SECRET / GMAIL_TOKEN_ENCRYPTION_KEY）"
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

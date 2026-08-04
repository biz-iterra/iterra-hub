/**
 * freee 連携の開始。freee の認可画面へ送る。
 *
 * CSRF 対策として state を発行し、Cookie に控えてコールバックで照合する
 * （Gmail 連携と同じ）。Gmail と違い**組織レベルの接続なので admin 限定**。
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFreeeConfig, freeeRedirectUri } from "@/lib/freee/config";
import { buildAuthorizeUrl } from "@/lib/freee/client";
import { resolveExternalOrigin } from "@/lib/app-origin";

export const OAUTH_STATE_COOKIE = "freee_oauth_state";

export async function GET(request: NextRequest) {
  const origin = resolveExternalOrigin(request.nextUrl.origin);
  const base = origin ?? request.nextUrl.origin;

  const back = (message: string) =>
    NextResponse.redirect(
      new URL(`/admin/freee?freee_error=${encodeURIComponent(message)}`, base)
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", base));
  }

  // 会計データに繋がる接続なので admin だけが行える
  const { data: me } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (me?.role !== "admin") {
    return back("freee 連携の操作は admin だけが行えます");
  }

  const config = getFreeeConfig();
  if (!config) {
    return back(
      "freee 連携が未設定です（FREEE_CLIENT_ID / FREEE_CLIENT_SECRET / FREEE_TOKEN_ENCRYPTION_KEY）"
    );
  }

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
    path: "/api/freee",
    maxAge: 600,
  });

  return NextResponse.redirect(
    buildAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: freeeRedirectUri(origin),
      state,
    })
  );
}

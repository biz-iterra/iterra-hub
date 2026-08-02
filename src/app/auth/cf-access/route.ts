/**
 * Cloudflare Access の認証をアプリのセッションに変換する。
 *
 * middleware が「未ログインだが Access は通っている」リクエストをここへ回す。
 * JWT を検かめてから、そのメールアドレスの利用者としてセッションを張り、
 * 元のページへ戻す。**利用者にはログイン画面が見えない。**
 *
 * パスワードは使わない。Supabase の一度きりのトークンを裏で発行して
 * その場で消費する（外へは出さない）。
 */

import { NextResponse, type NextRequest } from "next/server";

import {
  CF_ACCESS_JWT_HEADER,
  getCfAccessConfig,
  verifyCfAccessJwt,
} from "@/lib/cf-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** 戻り先。外部サイトへ飛ばされないよう自サイト内のパスだけを許す */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

function toLogin(request: NextRequest, reason: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!getCfAccessConfig()) {
    return toLogin(request, "Cloudflare Access 連携が未設定です");
  }

  const email = await verifyCfAccessJwt(
    request.headers.get(CF_ACCESS_JWT_HEADER)
  );
  if (!email) {
    return toLogin(request, "Cloudflare Access の認証を確認できませんでした");
  }

  // Access を通っていても、CRM の利用者として登録されていなければ入れない。
  // 退職者を止める経路をアプリ側にも残しておく
  const admin = createAdminClient();
  const { data: crmUser } = await admin
    .from("crm_users")
    .select("id, is_active")
    .eq("email", email)
    .maybeSingle();

  if (!crmUser || !crmUser.is_active) {
    return toLogin(request, "このアカウントは CRM を利用できません");
  }

  // 一度きりのトークンを発行して即座に使う。メールは送られない
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return toLogin(request, "セッションを開始できませんでした");
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError) {
    return toLogin(request, "セッションを開始できませんでした");
  }

  const url = request.nextUrl.clone();
  url.pathname = safeNextPath(request.nextUrl.searchParams.get("next"));
  url.search = "";
  return NextResponse.redirect(url);
}

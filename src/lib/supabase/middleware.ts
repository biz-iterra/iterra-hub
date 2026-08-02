import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  CF_ACCESS_CALLBACK_PATH,
  CF_ACCESS_JWT_HEADER,
} from "@/lib/cf-access";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Supabase未設定時はログインページのみ許可、他は全てログインへリダイレクト
    const isLoginPage = request.nextUrl.pathname === "/login";
    if (!isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname === "/login";
  // セッションを張る経路そのものは素通しする。回さないと無限に往復する
  const isAccessCallback =
    request.nextUrl.pathname === CF_ACCESS_CALLBACK_PATH;

  if (!user && !isLoginPage && !isAccessCallback) {
    // Cloudflare Access を通っていれば、その認証を引き継いでセッションを張る。
    // 同じ人に 2 回名乗らせないため（src/lib/cf-access.ts）
    if (request.headers.get(CF_ACCESS_JWT_HEADER)) {
      const url = request.nextUrl.clone();
      url.pathname = CF_ACCESS_CALLBACK_PATH;
      url.search = "";
      url.searchParams.set(
        "next",
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(url);
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

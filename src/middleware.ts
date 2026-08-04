import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api/health は認証対象外。Docker の healthcheck と外形監視が
    // /login へリダイレクトされないようにするため除外する。
    // api/gmail/sync・api/leads/inquiry-sync・api/freee/sync も同様。Cookie を持たない
    // タスクスケジューラから叩くため、認証は Bearer トークンでルート側が行う。
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/gmail/sync|api/leads/inquiry-sync|api/freee/sync|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

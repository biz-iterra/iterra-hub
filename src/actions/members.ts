"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createMemberSchema } from "@/lib/validators/members";

/**
 * 社内メンバー（`crm_users` + Supabase Auth のユーザー）。
 *
 * `crm_users` には INSERT ポリシーが無く、UPDATE も本人だけに限られている。
 * 管理者が他人を足したり止めたりするので、権限を確かめたうえで
 * service_role で操作する。
 *
 * **物理削除はしない。** `crm_users.id` は 35 個の列の `created_by` 既定値に
 * 使われており、消すと過去の記録が壊れる。止めるときは `is_active` を落とし、
 * Auth 側も `banned_until` で入れなくする（docs/deployment-nas.md § 2.4）。
 */

type ActionResult<T> = { data: T | null; error: string | null };

export type MemberRow = {
  id: string;
  email: string;
  full_name: string;
  full_name_kana: string | null;
  role: string;
  is_active: boolean;
  /** Auth 側の最終ログイン。一度も入っていなければ null */
  last_sign_in_at: string | null;
  created_at: string;
  /** Auth 側で入室を止めているか。is_active と食い違っていたら要確認 */
  is_banned: boolean;
};

/** 操作者が admin かを確かめる。RLS では足りない（service_role で動かすため） */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "認証が必要です" };

  const { data: me } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (me?.role !== "admin") {
    return { ok: false as const, error: "管理者権限が必要です" };
  }
  return { ok: true as const, userId: user.id };
}

/**
 * メンバーの一覧。
 *
 * 最終ログインは `auth.users` にあり、通常のクライアントからは読めないので
 * service_role で引いて突き合わせる。
 */
export async function getMembers(): Promise<ActionResult<MemberRow[]>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { data: null, error: auth.error };

  const admin = createAdminClient();

  const [{ data: crmUsers, error }, authList] = await Promise.all([
    admin
      .from("crm_users")
      .select("id, email, full_name, full_name_kana, role, is_active, created_at")
      .order("created_at"),
    // 社内メンバーなので 1 ページに収まる想定。増えたらページを送ること
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (error) return { data: null, error: error.message };

  const byId = new Map(authList.data.users.map((u) => [u.id, u]));

  return {
    data: (crmUsers ?? []).map((u) => {
      const authUser = byId.get(u.id);
      const bannedUntil = (authUser as { banned_until?: string } | undefined)
        ?.banned_until;
      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        full_name_kana: u.full_name_kana,
        role: u.role,
        is_active: u.is_active,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        created_at: u.created_at,
        is_banned: Boolean(bannedUntil && new Date(bannedUntil) > new Date()),
      };
    }),
    error: null,
  };
}

/**
 * メンバーを追加する。
 *
 * Auth のユーザーと `crm_users` は対で作る。**パスワードは設定しない**
 * （Cloudflare Access 経由で入る運用。個別に要る場合は本人が再設定する）。
 * 途中で失敗したら作りかけの Auth ユーザーを消して元に戻す。
 */
export async function createMember(
  input: Record<string, unknown>
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { data: null, error: auth.error };

  const parsed = createMemberSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("crm_users")
    .select("id, is_active")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (existing) {
    return {
      data: null,
      error: existing.is_active
        ? "このメールアドレスは既に登録されています"
        : "このメールアドレスは停止中のメンバーとして登録されています。再開してください",
    };
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
  });

  if (authError || !created.user) {
    return {
      data: null,
      error: authError?.message ?? "認証ユーザーを作成できませんでした",
    };
  }

  const { error: insertError } = await admin.from("crm_users").insert({
    id: created.user.id,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    full_name_kana: parsed.data.full_name_kana ?? null,
    role: parsed.data.role,
    is_active: true,
  });

  if (insertError) {
    // 認証だけ残ると、次に同じメールで追加できなくなる
    await admin.auth.admin.deleteUser(created.user.id);
    return { data: null, error: insertError.message };
  }

  revalidatePath("/admin/members");
  return { data: { id: created.user.id }, error: null };
}

/**
 * メンバーの利用を止める / 再開する。
 *
 * 消さずに止めるのは、`crm_users.id` が過去の記録の作成者として
 * 参照されているため。Auth 側も合わせて閉じないと、CRM では停止扱いなのに
 * ログインだけはできてしまう。
 */
export async function setMemberActive(
  memberId: string,
  active: boolean
): Promise<ActionResult<null>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { data: null, error: auth.error };

  // 自分を止めると誰も管理できなくなる
  if (!active && memberId === auth.userId) {
    return { data: null, error: "自分自身は停止できません" };
  }

  const admin = createAdminClient();

  if (!active) {
    // 最後の管理者を止めると、誰もメンバーを戻せなくなる
    const { count } = await admin
      .from("crm_users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", memberId);

    if ((count ?? 0) === 0) {
      return { data: null, error: "管理者が居なくなるため停止できません" };
    }
  }

  const { error } = await admin
    .from("crm_users")
    .update({ is_active: active })
    .eq("id", memberId);

  if (error) return { data: null, error: error.message };

  // Auth 側も揃える。期限なしの ban と解除
  const { error: authError } = await admin.auth.admin.updateUserById(memberId, {
    ban_duration: active ? "none" : "876000h",
  });

  if (authError) {
    // CRM 側だけ止まった状態は危ないので戻す
    await admin.from("crm_users").update({ is_active: !active }).eq("id", memberId);
    return { data: null, error: authError.message };
  }

  revalidatePath("/admin/members");
  return { data: null, error: null };
}

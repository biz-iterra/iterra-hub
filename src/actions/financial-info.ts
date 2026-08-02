"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  createFinancialInfoSchema,
  updateFinancialInfoSchema,
} from "@/lib/validators/financial-info";
import type { Row } from "@/types/relations";

/**
 * 金融機関情報（振込先の口座）。
 *
 * 1 つの事業者が複数持てる（本店口座と支払専用口座など）。住所と同じく
 * 本体の保存とは切り離して増減させる。
 *
 * **口座番号を含むので扱いを絞る。** 閲覧は manager 以上、追加・変更・削除は
 * admin だけ。RLS でも同じ制限が掛かっているが、画面に出す前にここで弾く。
 */

type ActionResult<T> = { data: T | null; error: string | null };

export type FinancialInfoRow = Pick<
  Row<"financial_info">,
  | "id"
  | "company_id"
  | "bank_name"
  | "bank_code"
  | "branch_name"
  | "branch_code"
  | "account_type"
  | "account_number"
  | "account_holder"
  | "account_holder_kana"
  | "is_primary"
>;

const SELECT_COLUMNS =
  "id, company_id, bank_name, bank_code, branch_name, branch_code, account_type, account_number, account_holder, account_holder_kana, is_primary";

async function authorize(need: "read" | "write") {
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

  const role = me?.role;
  if (need === "read" && role !== "manager" && role !== "admin") {
    return {
      ok: false as const,
      error: "金融機関情報の閲覧には manager 以上の権限が必要です",
    };
  }
  if (need === "write" && role !== "admin") {
    return {
      ok: false as const,
      error: "金融機関情報の変更には管理者権限が必要です",
    };
  }
  return { ok: true as const, supabase, userId: user.id };
}

export async function getCompanyFinancialInfo(
  companyId: string
): Promise<ActionResult<FinancialInfoRow[]>> {
  const auth = await authorize("read");
  if (!auth.ok) return { data: null, error: auth.error };

  const { data, error } = await auth.supabase
    .from("financial_info")
    .select(SELECT_COLUMNS)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    // 主口座を先頭に。あとは登録順
    .order("is_primary", { ascending: false })
    .order("created_at");

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function createFinancialInfo(
  input: Record<string, unknown>
): Promise<ActionResult<FinancialInfoRow>> {
  const auth = await authorize("write");
  if (!auth.ok) return { data: null, error: auth.error };

  const parsed = createFinancialInfoSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const { company_id, is_primary, ...fields } = parsed.data;

  // 1 件目は自動的に主口座。2 件目以降は指定に従う
  const { count } = await auth.supabase
    .from("financial_info")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company_id)
    .is("deleted_at", null);

  const shouldBePrimary = is_primary ?? (count ?? 0) === 0;

  // 主を付け替えるときは先に外す。一意索引と衝突するため
  if (shouldBePrimary) {
    await auth.supabase
      .from("financial_info")
      .update({ is_primary: false })
      .eq("company_id", company_id)
      .is("deleted_at", null);
  }

  const { data, error } = await auth.supabase
    .from("financial_info")
    .insert({
      ...fields,
      company_id,
      is_primary: shouldBePrimary,
      created_by: auth.userId,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { data: null, error: error.message };

  revalidatePath(`/companies/${company_id}`);
  revalidatePath(`/companies/${company_id}/edit`);
  return { data, error: null };
}

export async function updateFinancialInfo(
  id: string,
  input: Record<string, unknown>
): Promise<ActionResult<FinancialInfoRow>> {
  const auth = await authorize("write");
  if (!auth.ok) return { data: null, error: auth.error };

  const parsed = updateFinancialInfoSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { data: null, error: `[${issue.path.join(".")}] ${issue.message}` };
  }

  const { data: current } = await auth.supabase
    .from("financial_info")
    .select("company_id")
    .eq("id", id)
    .single();

  if (!current?.company_id) return { data: null, error: "金融機関情報が見つかりません" };

  if (parsed.data.is_primary) {
    await auth.supabase
      .from("financial_info")
      .update({ is_primary: false })
      .eq("company_id", current.company_id)
      .neq("id", id)
      .is("deleted_at", null);
  }

  const { data, error } = await auth.supabase
    .from("financial_info")
    .update({ ...parsed.data, last_updated_by: auth.userId })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .single();

  if (error) return { data: null, error: error.message };

  revalidatePath(`/companies/${current.company_id}`);
  revalidatePath(`/companies/${current.company_id}/edit`);
  return { data, error: null };
}

/** 論理削除。口座は取引の記録に紐づくので消さずに残す */
export async function deleteFinancialInfo(id: string): Promise<ActionResult<null>> {
  const auth = await authorize("write");
  if (!auth.ok) return { data: null, error: auth.error };

  const { data: current } = await auth.supabase
    .from("financial_info")
    .select("company_id, is_primary")
    .eq("id", id)
    .single();

  if (!current?.company_id) return { data: null, error: "金融機関情報が見つかりません" };

  const { error } = await auth.supabase
    .from("financial_info")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      // 消した口座が「主」のまま残ると、次に主を立てるとき一意索引に当たる
      is_primary: false,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };

  // 主口座を消したら、残っているうちの先頭を主にする。
  // 振込先が 1 つも「主」でない状態を作らない
  if (current.is_primary) {
    const { data: next } = await auth.supabase
      .from("financial_info")
      .select("id")
      .eq("company_id", current.company_id)
      .is("deleted_at", null)
      .order("created_at")
      .limit(1)
      .maybeSingle();

    if (next) {
      await auth.supabase
        .from("financial_info")
        .update({ is_primary: true })
        .eq("id", next.id);
    }
  }

  revalidatePath(`/companies/${current.company_id}`);
  revalidatePath(`/companies/${current.company_id}/edit`);
  return { data: null, error: null };
}

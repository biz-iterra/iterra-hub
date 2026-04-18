"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createContactSchema,
  updateContactSchema,
  createContactEmailSchema,
  createContactPhoneSchema,
} from "@/lib/validators/contacts";
import { calcPotentialNumber, calcZodiacSign } from "@/lib/diagnosis";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// 生年月日から potential_number / constellation_id を算出して values に差し込む。
// 入力値が明示されている場合は上書きしない。マスタ未投入時はエラーを返して書込を中止させる（§10.7）。
// 戻り値: エラーメッセージ（null なら成功）
async function applyBirthDateDiagnosis(
  supabase: SupabaseClient,
  values: Record<string, unknown>,
  birthDate: string,
  inputKeys: Set<string>,
): Promise<string | null> {
  if (!inputKeys.has("potential_number")) {
    const num = calcPotentialNumber(birthDate);
    const { data: numRow, error: numErr } = await supabase
      .from("number_diagnosis")
      .select("number")
      .eq("number", num)
      .maybeSingle();
    if (numErr) return `ポテンシャル診断マスタの参照に失敗しました: ${numErr.message}`;
    if (!numRow) {
      return `ポテンシャル診断マスタ（number=${num}）が見つかりません。マスタを整備してください`;
    }
    values.potential_number = num;
  }

  if (!inputKeys.has("constellation_id")) {
    const constellation = calcZodiacSign(birthDate);
    const { data: cRow, error: cErr } = await supabase
      .from("constellation_fortune_telling")
      .select("id")
      .eq("constellation", constellation)
      .maybeSingle();
    if (cErr) return `星座マスタの参照に失敗しました: ${cErr.message}`;
    if (!cRow?.id) {
      return `星座マスタ（constellation=${constellation}）が見つかりません。マスタを整備してください`;
    }
    values.constellation_id = cRow.id;
  }

  return null;
}

type ActionResult<T> = { data: T | null; error: string | null };

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase: null, user: null, role: null };
  const { data: crmUser } = await supabase
    .from("crm_users")
    .select("role")
    .eq("id", user.id)
    .single();
  return { supabase, user, role: crmUser?.role ?? null };
}

// ---------------------------------------------------------------------------
// 一覧取得
// ---------------------------------------------------------------------------
export async function getContacts(
  params?: { search?: string; page?: number; perPage?: number }
): Promise<ActionResult<{ rows: unknown[]; count: number }>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("contacts")
    .select(
      `*, contact_status:contact_statuses(id, name), company:companies(id, name), owner:crm_users!contacts_owner_user_id_fkey(id, full_name), contact_emails(id, email, label, is_primary), contact_phones(id, phone, label, is_primary)`,
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (params?.search) {
    query = query.or(
      `last_name.ilike.%${params.search}%,first_name.ilike.%${params.search}%,contact_code.ilike.%${params.search}%`
    );
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], count: count ?? 0 }, error: null };
}

// ---------------------------------------------------------------------------
// 詳細取得
// ---------------------------------------------------------------------------
export async function getContact(id: string): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `*, contact_status:contact_statuses(id, name), company:companies(id, name), owner:crm_users!contacts_owner_user_id_fkey(id, full_name), contact_emails(id, email, label, is_primary), contact_phones(id, phone, label, is_primary), talent:talents(*, talent_skills(*, skill:skills(id, name, skill_categories(name))), talent_careers(*)), number_diagnosis(*), constellation_fortune_telling:constellation_fortune_telling(*), account_contacts(id, role, account:accounts(id, account_code, name))`
    )
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 作成
// ---------------------------------------------------------------------------
export async function createContact(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "input";
    return { data: null, error: `[${field}] ${issue.message}` };
  }

  const values: Record<string, unknown> = {
    ...parsed.data,
    owner_user_id: parsed.data.owner_user_id ?? user.id,
  };

  if (parsed.data.birth_date) {
    const inputKeys = new Set(Object.keys((input ?? {}) as Record<string, unknown>));
    const diagErr = await applyBirthDateDiagnosis(supabase, values, parsed.data.birth_date, inputKeys);
    if (diagErr) return { data: null, error: diagErr };
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert(values)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 更新
// ---------------------------------------------------------------------------
export async function updateContact(
  id: string,
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("contacts").select("owner_user_id").eq("id", id).single();
    if (!existing) return { data: null, error: "コンタクトが見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "このコンタクトを編集する権限がありません" };
  }

  const parsed = updateContactSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join(".") || "input";
    const inputObj = (input ?? {}) as Record<string, unknown>;
    const received = field in inputObj ? inputObj[field] : "(キー自体が未送信)";
    return {
      data: null,
      error: `[${field}] ${issue.message} / 受信値: ${JSON.stringify(received)}`,
    };
  }

  // 変更前データ取得
  const { data: before, error: fetchErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr) return { data: null, error: fetchErr.message };

  // status_updated_at をステータス変更時に更新
  const updates: Record<string, unknown> = { ...parsed.data };
  if (
    parsed.data.contact_status_id &&
    parsed.data.contact_status_id !== before.contact_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  // birth_date の変化に応じて potential_number / constellation_id を同期（§10.8）。
  // - 値が変わった → 再計算。マスタ未投入ならエラーで書込中止。
  // - null に変わった → 診断値も null にクリア（明示指定があればそれを優先）。
  const inputKeys = new Set(Object.keys((input ?? {}) as Record<string, unknown>));
  if (
    inputKeys.has("birth_date") &&
    parsed.data.birth_date !== before.birth_date
  ) {
    if (parsed.data.birth_date) {
      const diagErr = await applyBirthDateDiagnosis(supabase, updates, parsed.data.birth_date, inputKeys);
      if (diagErr) return { data: null, error: diagErr };
    } else {
      if (!inputKeys.has("potential_number")) updates.potential_number = null;
      if (!inputKeys.has("constellation_id")) updates.constellation_id = null;
    }
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return { data: null, error: error.message };

  // 変更履歴記録
  const changedFields = Object.keys(parsed.data) as (keyof typeof parsed.data)[];
  const histories = changedFields
    .filter((key) => parsed.data[key] !== before[key])
    .map((field) => ({
      contact_id: id,
      field_name: field as string,
      old_value: before[field] != null ? String(before[field]) : null,
      new_value:
        parsed.data[field] != null ? String(parsed.data[field]) : null,
      changed_by: user.id,
    }));

  if (histories.length > 0) {
    await supabase.from("contact_change_histories").insert(histories);
  }

  // キャッシュ無効化: 詳細・一覧を再フェッチさせる
  revalidatePath(`/contacts/${id}`);
  revalidatePath(`/contacts/${id}/edit`);
  revalidatePath("/contacts");

  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 論理削除
// ---------------------------------------------------------------------------
export async function deleteContact(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "admin") return { data: null, error: "管理者権限が必要です" };

  const { error } = await supabase
    .from("contacts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// メールアドレス追加
// ---------------------------------------------------------------------------
export async function addContactEmail(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("contact_emails")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// メールアドレス更新
// ---------------------------------------------------------------------------
export async function updateContactEmail(
  id: string,
  input: { email?: string; label?: string; is_primary?: boolean }
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_emails")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// メールアドレス削除
// ---------------------------------------------------------------------------
export async function deleteContactEmail(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("contact_emails")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// 電話番号追加
// ---------------------------------------------------------------------------
export async function addContactPhone(
  input: unknown
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactPhoneSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("contact_phones")
    .insert(parsed.data)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 電話番号更新
// ---------------------------------------------------------------------------
export async function updateContactPhone(
  id: string,
  input: { phone?: string; label?: string; is_primary?: boolean }
): Promise<ActionResult<unknown>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_phones")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// 電話番号削除
// ---------------------------------------------------------------------------
export async function deleteContactPhone(
  id: string
): Promise<ActionResult<null>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { error } = await supabase
    .from("contact_phones")
    .delete()
    .eq("id", id);

  if (error) return { data: null, error: error.message };
  return { data: null, error: null };
}

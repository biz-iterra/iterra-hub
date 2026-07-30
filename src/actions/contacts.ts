"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { conflictErrorMessage } from "@/lib/validators/common";
import type { Database } from "@/types/database.generated";
import {
  createContactSchema,
  updateContactSchema,
  createContactEmailSchema,
  createContactPhoneSchema,
} from "@/lib/validators/contacts";
import { calcPotentialNumber, calcZodiacSign } from "@/lib/diagnosis";
import type {
  ContactDetail,
  ContactWithRelations,
  Paged,
  Row,
} from "@/types/relations";

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
  params?: {
    search?: string;
    page?: number;
    perPage?: number;
    statusId?: string;
    contactType?: string;
    ownerUserId?: string;
  }
): Promise<ActionResult<Paged<ContactWithRelations>>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const page = params?.page ?? 1;
  const perPage = params?.perPage ?? 20;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabase
    .from("contacts")
    .select(
      `*, contact_status:contact_statuses(id, name), company:companies!contacts_company_id_fkey(id, name), owner:crm_users!contacts_owner_user_id_fkey(id, full_name), contact_emails(id, email, label, is_primary), contact_phones(id, phone, label, is_primary)`,
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

  if (params?.statusId) {
    query = query.eq("contact_status_id", params.statusId);
  }

  if (params?.contactType) {
    query = query.eq("contact_type", params.contactType);
  }

  if (params?.ownerUserId) {
    query = query.eq("owner_user_id", params.ownerUserId);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: error.message };
  return { data: { rows: data ?? [], total: count ?? 0 }, error: null };
}

// ---------------------------------------------------------------------------
// 詳細取得
// ---------------------------------------------------------------------------
export async function getContact(id: string): Promise<ActionResult<ContactDetail>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contacts")
    .select(
      `*, contact_status:contact_statuses(id, name), company:companies!contacts_company_id_fkey(id, name), owner:crm_users!contacts_owner_user_id_fkey(id, full_name), contact_emails(id, email, label, is_primary), contact_phones(id, phone, label, is_primary), talent:talents(*, talent_skills(*, skill:skills(id, name, skill_categories(name))), talent_careers(*)), number_diagnosis(*), constellation_fortune_telling:constellation_fortune_telling(*), account_contacts(id, role, account:accounts(id, account_code, name))`
    )
    .eq("id", id)
    .single();

  if (error) return { data: null, error: error.message };
  // talent_careers.career_type は DB の CHECK 制約で 3 値に限定されているが
  // 生成型では TEXT のままなので、ここで一度だけ絞り込んだ型に寄せる。
  return { data: data as ContactDetail, error: null };
}

// ---------------------------------------------------------------------------
// 作成
// ---------------------------------------------------------------------------
export async function createContact(
  input: unknown
): Promise<ActionResult<Row<"contacts">>> {
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
    created_by: user.id,
  };

  if (parsed.data.birth_date) {
    const inputKeys = new Set(Object.keys((input ?? {}) as Record<string, unknown>));
    const diagErr = await applyBirthDateDiagnosis(supabase, values, parsed.data.birth_date, inputKeys);
    if (diagErr) return { data: null, error: diagErr };
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert(values as Database["public"]["Tables"]["contacts"]["Insert"])
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
): Promise<ActionResult<Row<"contacts">>> {
  const { supabase, user, role } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  // owner チェック（admin 以外は自分の担当のみ）
  if (role !== "admin") {
    const { data: existing } = await supabase.from("contacts").select("owner_user_id").eq("id", id).single();
    if (!existing) return { data: null, error: "連絡先が見つかりません" };
    if (existing.owner_user_id !== user.id) return { data: null, error: "この連絡先を編集する権限がありません" };
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

  // expected_updated_at は DB カラムではないため更新値から除外する
  const { expected_updated_at, ...fields } = parsed.data;

  // status_updated_at をステータス変更時に更新
  const updates: Record<string, unknown> = { ...fields };
  if (
    fields.contact_status_id &&
    fields.contact_status_id !== before.contact_status_id
  ) {
    updates.status_updated_at = new Date().toISOString();
  }

  // birth_date の変化に応じて potential_number / constellation_id を同期（§10.8）。
  // - 値が変わった → 再計算。マスタ未投入ならエラーで書込中止。
  // - null に変わった → 診断値も null にクリア（明示指定があればそれを優先）。
  const inputKeys = new Set(Object.keys((input ?? {}) as Record<string, unknown>));
  if (
    inputKeys.has("birth_date") &&
    fields.birth_date !== before.birth_date
  ) {
    if (fields.birth_date) {
      const diagErr = await applyBirthDateDiagnosis(supabase, updates, fields.birth_date, inputKeys);
      if (diagErr) return { data: null, error: diagErr };
    } else {
      if (!inputKeys.has("potential_number")) updates.potential_number = null;
      if (!inputKeys.has("constellation_id")) updates.constellation_id = null;
    }
  }

  // 楽観ロック: 編集開始時点から updated_at が変わっていれば 0 行更新になる
  let updateQuery = supabase
    .from("contacts")
    .update({ ...updates, last_updated_by: user.id })
    .eq("id", id);
  if (expected_updated_at) {
    updateQuery = updateQuery.eq("updated_at", expected_updated_at);
  }

  const { data, error } = await updateQuery.select().maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: conflictErrorMessage("この連絡先") };

  // 変更履歴は entity_change_logs のトリガーが自動記録する（20260728000002）

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
      last_updated_by: user.id,
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
): Promise<ActionResult<Row<"contact_emails">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("contact_emails")
    .insert({ ...parsed.data, created_by: user.id })
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
): Promise<ActionResult<Row<"contact_emails">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_emails")
    .update({ ...input, last_updated_by: user.id })
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
): Promise<ActionResult<Row<"contact_phones">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const parsed = createContactPhoneSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues[0].message };
  }

  const { data, error } = await supabase
    .from("contact_phones")
    .insert({ ...parsed.data, created_by: user.id })
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
): Promise<ActionResult<Row<"contact_phones">>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("contact_phones")
    .update({ ...input, last_updated_by: user.id })
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

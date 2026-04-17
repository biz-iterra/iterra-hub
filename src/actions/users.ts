"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult<T> = { data: T | null; error: string | null };

export async function getCurrentUser(): Promise<ActionResult<{ id: string; full_name: string; role: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("crm_users")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getCrmUsers(): Promise<ActionResult<{ id: string; full_name: string; role: string }[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "認証が必要です" };

  const { data, error } = await supabase
    .from("crm_users")
    .select("id, full_name, role")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

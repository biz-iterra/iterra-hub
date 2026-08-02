"use server";

import { createClient } from "@/lib/supabase/server";
import {
  isHoujinApiConfigured,
  searchByName,
  searchByNumber,
  REQUEST_INTERVAL_MS,
} from "@/lib/houjin-bangou/client";
import { matchCompany, diffCompany } from "@/lib/houjin-bangou/match";
import { formatAddress } from "@/lib/houjin-bangou/parse";
import type { Database } from "@/types/database.generated";

type ActionResult<T> = { data: T | null; error: string | null };

type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];
type Json = Database["public"]["Tables"]["company_verification_logs"]["Insert"]["detail"];

/** 1 社の照合結果。company_verification_logs.result と対応する */
export type VerificationOutcome =
  | "verified"
  | "changed"
  | "not_found"
  | "closed"
  | "error";

export type VerifyOneResult = {
  companyId: string;
  companyName: string;
  outcome: VerificationOutcome;
  corporateNumber: string | null;
  note: string | null;
};

async function getAuthenticatedManager() {
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

/** 照合結果 → 法人ステータスの code */
const OUTCOME_TO_STATUS: Record<VerificationOutcome, string | null> = {
  verified: "verified",
  changed: "needs_review",
  not_found: "needs_review",
  closed: "closed",
  // 通信エラーは法人の状態ではないのでステータスを動かさない
  error: null,
};

/**
 * 1 社を照合し、結果をステータス・確認記録・履歴に反映する。
 *
 * 法人番号を持っていれば番号で、無ければ商号で引く。
 * 商号検索で 1 件に決まらない場合は「要確認」にして人に回す。
 * 自動で決め打つと誤った法人番号が台帳に入り、以降の確認がその法人を追い続ける。
 */
export async function verifyCompany(
  companyId: string
): Promise<ActionResult<VerifyOneResult>> {
  const { supabase, user, role } = await getAuthenticatedManager();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  const { data: company, error: fetchErr } = await supabase
    .from("companies")
    .select("id, name, corporate_number, corporate_type:corporate_types(name)")
    .eq("id", companyId)
    .is("deleted_at", null)
    .single();

  if (fetchErr || !company) return { data: null, error: "事業者情報が見つかりません" };

  // 個人事業主は法人番号を持たないので、国税庁の台帳には載らない。
  // 商号検索で同名の法人に当たってしまうため、照合そのものを行わない
  if (company.corporate_type?.name === "個人事業主") {
    return {
      data: null,
      error: "個人事業主は法人番号を持たないため、実在確認の対象外です",
    };
  }

  // 所在地は住所マスタ側にある。照合には主住所を使う
  const { data: primaryAddress } = await supabase
    .from("entity_addresses")
    .select("address:addresses(prefecture, city, address_line1)")
    .eq("company_id", companyId)
    .eq("is_primary", true)
    .maybeSingle();

  const addr = (primaryAddress?.address ?? null) as {
    prefecture: string | null;
    city: string | null;
    address_line1: string | null;
  } | null;

  const apiResult = company.corporate_number
    ? await searchByNumber(company.corporate_number)
    : await searchByName(company.name);

  let outcome: VerificationOutcome;
  let corporateNumber: string | null = company.corporate_number;
  let note: string | null = null;
  // 後から原因を追うための生データ。jsonb にそのまま入れる
  let detail: Json = {};

  if (!apiResult.ok) {
    outcome = "error";
    note = apiResult.message;
    detail = { reason: apiResult.reason, message: apiResult.message };
  } else {
    const match = matchCompany(company.name, apiResult.records);

    switch (match.kind) {
      case "matched": {
        const current = {
          name: company.name,
          address: [addr?.prefecture, addr?.city, addr?.address_line1]
            .filter(Boolean)
            .join(""),
        };
        const diffs = diffCompany(current, match.record);
        corporateNumber = match.record.corporateNumber;

        if (diffs.length > 0) {
          outcome = "changed";
          note = diffs
            .map((d) => `${d.field === "name" ? "商号" : "所在地"}: ${d.before} → ${d.after}`)
            .join(" / ");
          detail = { diffs, record: match.record };
        } else {
          outcome = "verified";
          detail = { record: match.record };
        }
        break;
      }
      case "closed":
        outcome = "closed";
        corporateNumber = match.record.corporateNumber;
        note = `登記記録が閉鎖されています（${match.record.closeDate}）`;
        detail = { record: match.record };
        break;
      case "ambiguous":
        outcome = "not_found";
        note = `同名の法人が ${match.candidates.length} 件あり特定できません`;
        detail = {
          candidates: match.candidates.map((c) => ({
            corporateNumber: c.corporateNumber,
            name: c.name,
            address: formatAddress(c),
          })),
        };
        break;
      case "not_found":
        outcome = "not_found";
        note = "法人番号システムに一致する法人が見つかりません";
        detail = { searched: company.name, candidateCount: apiResult.records.length };
        break;
    }
  }

  // ── 反映 ──
  const statusCode = OUTCOME_TO_STATUS[outcome];
  const updates: CompanyUpdate = {
    verified_at: new Date().toISOString(),
    verified_by: user.id,
    verification_source: "houjin_bangou_api",
    verification_note: note,
    last_updated_by: user.id,
  };

  // 法人番号を引き当てられたら台帳に入れる。以降は番号で確認できる
  if (corporateNumber && corporateNumber !== company.corporate_number) {
    updates.corporate_number = corporateNumber;
  }

  if (statusCode) {
    const { data: status } = await supabase
      .from("company_statuses")
      .select("id")
      .eq("code", statusCode)
      .is("deleted_at", null)
      .maybeSingle();
    if (status) updates.company_status_id = status.id;
  }

  const { error: updateErr } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", companyId);

  if (updateErr) return { data: null, error: updateErr.message };

  // 履歴は INSERT ONLY。失敗しても確認自体は成立しているので処理は止めない
  await supabase.from("company_verification_logs").insert({
    company_id: companyId,
    source: "houjin_bangou_api",
    result: outcome,
    corporate_number: corporateNumber,
    detail,
    checked_by: user.id,
  });

  return {
    data: {
      companyId,
      companyName: company.name,
      outcome,
      corporateNumber,
      note,
    },
    error: null,
  };
}

export type BatchVerifyResult = {
  processed: number;
  counts: Record<VerificationOutcome, number>;
  results: VerifyOneResult[];
};

/**
 * 未確認・確認が古い法人からまとめて照合する。
 *
 * 定期実行の実体。API の利用規約に配慮して 1 件ずつ間隔を空けて叩くため、
 * 1 回の実行件数は上限を設ける（既定 20 件）。
 * 全件を一度に処理しようとすると数時間かかり、実行が途中で切れる。
 */
export async function verifyCompaniesBatch(
  limit = 20
): Promise<ActionResult<BatchVerifyResult>> {
  const { supabase, user, role } = await getAuthenticatedManager();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  if (role !== "manager" && role !== "admin") {
    return { data: null, error: "manager 以上の権限が必要です" };
  }

  if (!isHoujinApiConfigured()) {
    return {
      data: null,
      error:
        "法人番号 Web-API のアプリケーションID が未設定です。環境変数 HOUJIN_BANGOU_APP_ID を設定してください",
    };
  }

  const safeLimit = Math.min(Math.max(1, limit), 100);

  // 個人事業主は法人番号を持たず国税庁の台帳に載らないので、対象から外す。
  // 残すと毎回「該当なし」で枠を食い潰し、法人の確認が進まなくなる
  const { data: soleProprietor } = await supabase
    .from("corporate_types")
    .select("id")
    .eq("name", "個人事業主")
    .is("deleted_at", null)
    .maybeSingle();

  // 未確認（verified_at IS NULL）を先に、次に確認が古いものから
  let targetQuery = supabase
    .from("companies")
    .select("id")
    .is("deleted_at", null);

  if (soleProprietor) {
    // 法人格が未設定のものは対象に残す（法人かもしれないため）
    targetQuery = targetQuery.or(
      `corporate_type_id.is.null,corporate_type_id.neq.${soleProprietor.id}`
    );
  }

  const { data: targets, error } = await targetQuery
    .order("verified_at", { ascending: true, nullsFirst: true })
    .limit(safeLimit);

  if (error) return { data: null, error: error.message };

  const results: VerifyOneResult[] = [];
  const counts: Record<VerificationOutcome, number> = {
    verified: 0,
    changed: 0,
    not_found: 0,
    closed: 0,
    error: 0,
  };

  for (const [index, target] of (targets ?? []).entries()) {
    // 連続アクセスを避ける（先頭は待たない）
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    const { data, error: verifyErr } = await verifyCompany(target.id);
    if (verifyErr || !data) {
      counts.error += 1;
      continue;
    }
    counts[data.outcome] += 1;
    results.push(data);
  }

  return {
    data: { processed: results.length, counts, results },
    error: null,
  };
}

/** 画面で「API が使えるか」を出すため */
export async function getHoujinApiStatus(): Promise<
  ActionResult<{ configured: boolean }>
> {
  const { supabase, user } = await getAuthenticatedManager();
  if (!supabase || !user) return { data: null, error: "認証が必要です" };
  return { data: { configured: isHoujinApiConfigured() }, error: null };
}

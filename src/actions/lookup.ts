"use server";

import { getAccounts } from "@/actions/accounts";
import { getCompanies } from "@/actions/companies";
import { getContacts } from "@/actions/contacts";
import { getDeals } from "@/actions/deals";
import { getLeads } from "@/actions/leads";
import { getProjects } from "@/actions/projects";

/**
 * 紐づけ先を打ちながら探すための検索。
 *
 * 詳細ページで候補を先に配ってしまうと、事業者情報のように 3,500 件あるものは
 * 全部は渡せず（先頭 1,000 件で切っていた）、そこに無い相手は永久に選べない。
 * 打った文字をサーバーへ投げて、そのつど候補を引く。
 *
 * 種類は文字列で受け取る。サーバーコンポーネントからクライアントへ関数は
 * 渡せないため、`SearchableSelect` には「何を探すか」だけを渡す。
 */

export type LookupKind = "company" | "account" | "contact" | "deal" | "project" | "lead";

export type LookupOption = { value: string; label: string };

/** 1 回に返す上限。これ以上は打ち足してもらう */
const LIMIT = 50;

export async function searchLookupOptions(
  kind: LookupKind,
  query: string
): Promise<LookupOption[]> {
  const search = query.trim();
  const params = { search: search || undefined, page: 1, perPage: LIMIT };

  switch (kind) {
    case "company": {
      const { data } = await getCompanies(params);
      return (data?.rows ?? []).map((c) => ({ value: c.id, label: c.name }));
    }
    case "account": {
      const { data } = await getAccounts(params);
      return (data?.rows ?? []).map((a) => ({
        value: a.id,
        label: a.account_code ? `${a.account_code} ${a.name}` : a.name,
      }));
    }
    case "contact": {
      const { data } = await getContacts(params);
      return (data?.rows ?? []).map((c) => ({
        value: c.id,
        label: [c.last_name, c.first_name].filter(Boolean).join(" ") || "(無名)",
      }));
    }
    case "deal": {
      const { data } = await getDeals(params);
      return (data?.rows ?? []).map((d) => ({
        value: d.id,
        label:
          `${d.deal_code} ${d.name}` + (d.account?.name ? ` / ${d.account.name}` : ""),
      }));
    }
    case "project": {
      const { data } = await getProjects(params);
      return (data?.rows ?? []).map((p) => ({
        value: p.id,
        label: p.project_code ? `${p.project_code} ${p.name}` : p.name,
      }));
    }
    case "lead": {
      // **getLeads だけ検索キーが `keyword`**（他は `search`）
      const { data } = await getLeads({
        keyword: search || undefined,
        page: 1,
        perPage: LIMIT,
      });
      return (data?.rows ?? []).map((l) => {
        // **ステージを出す。** 商談を作れる段階か（選定 = TQL 以上）を
        // 選ぶ前に見せたい（T-0070）
        const parts = [l.company_name, l.stage?.name].filter(
          (v): v is string => typeof v === "string" && v.length > 0
        );
        const name = l.lead_name ?? "(無名のリード)";
        return {
          value: l.id,
          label: parts.length > 0 ? `${name}（${parts.join(" / ")}）` : name,
        };
      });
    }
  }
}

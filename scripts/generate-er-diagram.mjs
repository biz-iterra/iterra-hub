#!/usr/bin/env node
/**
 * ER 図（docs/er-diagram.md）を DB の実体から作り直す。
 *
 *   npm run db:er
 *
 * 87 テーブル・273 の外部キーを 1 枚に描くと読めないので、業務の領域ごとに
 * 分ける。**マスタへの参照は各図から省く**（どの表からもマスタへ線が伸びて
 * 図が潰れるため）。マスタは末尾に一覧で出す。
 *
 * 手で描かないのは、書いた瞬間から古くなるから。テーブルを足したら
 * このコマンドを流し直す。
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_iterra-hub";

function query(sql) {
  const out = execFileSync(
    "docker",
    ["exec", CONTAINER, "psql", "-U", "postgres", "-t", "-A", "-F", "", "-c", sql],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(""));
}

/**
 * 領域。上から順に当てて、最初に当たったところへ入れる。
 * どこにも当たらなかったテーブルは「その他」に落ちるので、
 * 図を見て足りなければここへ足す。
 */
const AREAS = [
  {
    key: "customer",
    title: "顧客と取引",
    lead: "名刺から事業者・連絡先が生まれ、商談を経て契約で取引先ができる。",
    match: (t) =>
      [
        "companies",
        "accounts",
        "contacts",
        "deals",
        "contracts",
        "projects",
        "business_cards",
        "account_contacts",
        "account_roles",
        "deal_services",
        "deal_projects",
        "project_members",
        "financial_info",
        "company_domains",
        "contact_emails",
        "contact_phones",
        "contact_social_accounts",
        "contact_merge_candidates",
        "addresses",
        "entity_addresses",
      ].includes(t),
  },
  {
    key: "lead",
    title: "リードとマーケティング",
    lead: "取り込んだリードを育て、商談へ昇格させるまで。",
    match: (t) => t.startsWith("lead") || t === "campaigns",
  },
  {
    key: "talent",
    title: "タレント",
    lead: "連絡先に 1 対 1 で紐づく人材の特性。",
    match: (t) =>
      t.startsWith("talent") ||
      ["skills", "skill_categories", "number_diagnosis", "constellation_fortune_telling"].includes(
        t
      ),
  },
  {
    key: "activity",
    title: "やり取りと履歴",
    lead: "メール連携と、全エンティティ共通の変更履歴。",
    match: (t) =>
      t.startsWith("email_") ||
      t.startsWith("gmail_") ||
      t.startsWith("deal_activit") ||
      t.endsWith("_histories") ||
      t.endsWith("_logs") ||
      t === "crm_users",
  },
];

/** マスタとみなす名前。各図から線を省き、末尾に一覧で出す */
function isMaster(table, comment) {
  if (/_types$|_statuses$|_stages$|_categories$|_sources$|_temperatures$|_segments$/.test(table)) {
    return true;
  }
  if (["services", "industry_classifications", "social_services", "skills"].includes(table)) {
    return true;
  }
  return /マスタ/.test(comment ?? "");
}

const tables = query(`
  SELECT c.relname, coalesce(obj_description(c.oid), '')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname;
`).map(([name, comment]) => ({ name, comment }));

const foreignKeys = query(`
  SELECT src.relname, tgt.relname, con.conname
  FROM pg_constraint con
  JOIN pg_class src ON src.oid = con.conrelid
  JOIN pg_class tgt ON tgt.oid = con.confrelid
  WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
  ORDER BY src.relname, tgt.relname;
`).map(([from, to, name]) => ({ from, to, name }));

/**
 * その FK が一意制約で守られていれば 1 対 1、そうでなければ 1 対多。
 *
 * 条件を絞らないと 1 対多まで 1 対 1 に見えてしまう:
 *   - `indnkeyatts = 1` … 複合ユニーク（contact_id + email など）は 1 対 1 ではない
 *   - `indpred IS NULL` … 「主メールは 1 件」のような部分索引も 1 対 1 ではない
 */
const uniqueSingleColumnFks = new Set(
  query(`
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.connamespace = 'public'::regnamespace
      AND array_length(con.conkey, 1) = 1
      AND EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = con.conrelid
          AND i.indisunique
          AND i.indnkeyatts = 1
          AND i.indpred IS NULL
          AND i.indkey[0] = con.conkey[1]
      );
  `).map(([name]) => name)
);

const masters = tables.filter((t) => isMaster(t.name, t.comment));
const masterNames = new Set(masters.map((t) => t.name));

const areaOf = new Map();
for (const { name } of tables) {
  if (masterNames.has(name)) continue;
  const area = AREAS.find((a) => a.match(name));
  areaOf.set(name, area?.key ?? "other");
}

function mermaidFor(areaKey) {
  const members = [...areaOf.entries()]
    .filter(([, key]) => key === areaKey)
    .map(([name]) => name);
  const inArea = new Set(members);

  const lines = ["erDiagram"];
  const seen = new Set();

  for (const fk of foreignKeys) {
    // マスタへの線は省く。全部引くと図がマスタに埋まる
    if (masterNames.has(fk.to) || masterNames.has(fk.from)) continue;
    if (!inArea.has(fk.from) || !inArea.has(fk.to)) continue;
    if (fk.from === fk.to) continue; // 自己参照は線にせず注記で補う

    const cardinality = uniqueSingleColumnFks.has(fk.name) ? "||--||" : "||--o{";
    const key = `${fk.to}${cardinality}${fk.from}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`  ${fk.to} ${cardinality} ${fk.from} : ""`);
  }

  // 線が 1 本も無いテーブルも図に出す（存在自体を見落とさないため）
  const drawn = new Set(lines.slice(1).flatMap((l) => l.trim().split(/\s+/).filter((w) => inArea.has(w))));
  for (const name of members) {
    if (!drawn.has(name)) lines.push(`  ${name} {`, `  }`);
  }

  return lines.join("\n");
}

const commentOf = new Map(tables.map((t) => [t.name, t.comment]));

function tableList(areaKey) {
  const members = [...areaOf.entries()]
    .filter(([, key]) => key === areaKey)
    .map(([name]) => name)
    .sort();
  if (members.length === 0) return "";
  const rows = members.map((name) => {
    const comment = (commentOf.get(name) ?? "").split("。")[0];
    return `| \`${name}\` | ${comment} |`;
  });
  return ["", "| テーブル | 役割 |", "|---|---|", ...rows, ""].join("\n");
}

const generatedAt = process.env.ER_GENERATED_AT ?? "";

const sections = AREAS.concat([
  { key: "other", title: "その他", lead: "上のどれにも入らなかったもの。増えたら領域を足す。" },
])
  .map((area) => {
    const body = mermaidFor(area.key);
    const list = tableList(area.key);
    if (!list) return "";
    return [
      `## ${area.title}`,
      "",
      area.lead,
      "",
      "```mermaid",
      body,
      "```",
      list,
    ].join("\n");
  })
  .filter(Boolean);

const masterRows = masters
  .map((m) => `| \`${m.name}\` | ${(m.comment ?? "").split("。")[0]} |`)
  .join("\n");

const doc = `# ER 図

**このファイルは生成物。** 手で直さず \`npm run db:er\` で作り直す
（\`scripts/generate-er-diagram.mjs\`）。ローカルの DB コンテナから
テーブルと外部キーを読んで組み立てる。

テーブル ${tables.length} 件・外部キー ${foreignKeys.length} 本を 1 枚に描くと読めないので、
業務の領域ごとに分けた。**マスタへの参照は各図から省いている**
（どの表からもマスタへ線が伸びて図が潰れるため）。マスタは末尾に一覧で置く。

線の向き: \`親 ||--o{ 子\`。一意制約が付いた外部キーだけ \`||--||\`（1 対 1）で描く。
自己参照（連絡先の紹介者など）は線にしていない。

${generatedAt ? `生成日時: ${generatedAt}\n` : ""}
${sections.join("\n\n")}

## マスタ

各図では線を省いた参照先。値の追加・変更は admin の「各種設定」から行う。

| テーブル | 役割 |
|---|---|
${masterRows}

## 別の見かた

| 方法 | 使いどころ |
|---|---|
| **Supabase Studio のスキーマ図** … \`http://127.0.0.1:54333\` → Database → Schema Visualizer | 実物を触りながら見る。カラムの型や制約もその場で確認できる |
| \`docs/database-design.md\` | 各テーブルの列定義・区分値・CRUD 権限。**仕様の正本はこちら** |
| \`npm run db:types\` で生成する \`src/types/database.generated.ts\` | コードから見た形。存在しない列を参照するとビルドで落ちる |
| \`supabase/migrations/\` | いつ何を変えたかの経緯 |
`;

const outPath = resolve(process.cwd(), "docs/er-diagram.md");
writeFileSync(outPath, doc, "utf8");
console.log(`ER 図を書き出しました: docs/er-diagram.md（テーブル ${tables.length} / FK ${foreignKeys.length}）`);

/**
 * 変更履歴を人が読める日本語にする。
 *
 * **DB のカラム名と生の値をそのまま出さない。** 利用者から
 * 「システムログをそのまま表示させているだけで日本語に最適化されていない」
 * と指摘を受けた（2026-08-05）。実際こう出ていた:
 *
 *   deleted_at: 空 → 2026-08-05T10:28:37.027+00:00 /
 *   deleted_by: 空 → a0000000-0000-0000-0000-000000000001
 *
 *   _row: {"id":"51e0646e-…","fax":null,"name":"検証-個人事業主",…（数百文字）
 *
 * 変換の判断はここに集める（画面に散らさない）。純粋関数なのでテストできる。
 */

// ---------------------------------------------------------------------------
// 項目名
// ---------------------------------------------------------------------------

/**
 * 列名 → 画面の呼び名。
 *
 * **共通の列を先に定義し、テーブル固有はその後で上書きする**（下の関数）。
 * 表記は画面のラベルに合わせる（CLAUDE.md「UI表示名と内部名の対応」）。
 */
const COMMON_FIELD_LABELS: Record<string, string> = {
  name: "名称",
  definition: "定義",
  description: "説明",
  color: "バッジ色",
  sort_order: "表示順",
  code: "コード",
  slug: "スラッグ",
  deleted_at: "削除",
  deleted_by: "削除者",
  deletion_reason: "削除理由",
  created_at: "作成日時",
  created_by: "作成者",
  updated_at: "更新日時",
  last_updated_by: "更新者",
  owner_user_id: "担当者",
  is_active: "有効",
  memo: "メモ",
  internal_memo: "社内メモ",
  phone: "電話番号",
  fax: "FAX",
  email: "メールアドレス",
  url: "URL",
  website_url: "URL",
  postal_code: "郵便番号",
  prefecture: "都道府県",
  city: "市区町村",
  address_line1: "番地",
  address_line2: "建物名",
  department: "部署",
  job_title: "役職",
  birth_date: "誕生日",
  note: "備考",
};

/** テーブルごとに意味が変わる列 */
const TABLE_FIELD_LABELS: Record<string, Record<string, string>> = {
  companies: {
    name: "事業者名",
    name_kana: "フリガナ",
    corporate_name: "会社名",
    trade_name: "屋号名",
    corporate_number: "法人番号",
    corporate_type_id: "事業種別",
    company_status_id: "ステータス",
    representative_name: "代表者",
    invoice_registered: "適格請求書発行事業者",
    invoice_registration_number: "インボイス登録番号",
    primary_contact_id: "主担当",
    lead_source_id: "流入元",
  },
  contacts: {
    last_name: "姓",
    middle_name: "ミドル名",
    first_name: "名",
    last_name_kana: "姓（カナ）",
    middle_name_kana: "ミドル名（カナ）",
    first_name_kana: "名（カナ）",
    contact_status_id: "ステータス",
    contact_type: "区分",
    company_id: "所属事業者",
    line_user_id: "LINE ID",
    potential_number: "ポテンシャル番号",
    constellation_id: "星座",
  },
  accounts: {
    name: "取引先名",
    account_type_id: "種別",
    account_status_id: "ステータス",
    company_id: "事業者情報",
  },
  deals: {
    name: "商談名",
    pipeline_type_id: "パイプライン",
    deal_stage_id: "ステージ",
    deal_status_id: "ステータス",
    account_id: "取引先",
    company_id: "事業者情報",
    contact_id: "連絡先",
    amount: "金額",
    expected_close_date: "クローズ予定日",
  },
  contracts: {
    // 「契約名」は自動生成の contract_display_name の方。
    // 人が入れるこちらは画面のラベルどおり「契約書名」
    contract_name: "契約書名",
    contract_display_name: "契約名",
    contract_type_id: "契約種別",
    amount: "金額",
    execution_date: "契約締結日",
    contract_method: "契約方法",
    start_date: "開始日",
    end_date: "終了日",
    cancellation_date: "解約日",
    deal_id: "商談",
  },
  leads: {
    lead_name: "リード名",
    company_name: "会社名",
    company_name_kana: "会社名（カナ）",
    stage_id: "ステージ",
    status_id: "ステータス",
    category_id: "デマンドファネル",
    temperature_id: "温度感",
    account_type_id: "事業者種別",
    lead_source_id: "流入元",
    company_phone: "会社電話番号",
    contact_phone: "担当者電話番号",
    contact_email: "担当者メール",
    contact_last_name: "担当者（姓）",
    contact_first_name: "担当者（名）",
    promoted_deal_id: "昇格先の商談",
    promoted_company_id: "昇格先の事業者情報",
    promoted_contact_id: "昇格先の連絡先",
    promoted_account_id: "昇格先の取引先",
    employee_count: "従業員数",
    capital: "資本金",
  },
  lead_stages: {
    requires_deal: "商談が必要",
    requires_contract: "契約が必要",
    is_terminal: "終端",
    auto_promote_to_deal: "商談を自動生成",
    is_inquiry_default: "問い合わせ取込の既定",
    is_qualification: "選定段階",
    is_system_required: "システム必須",
  },
  lead_statuses: {
    stage_id: "ステージ",
    is_inquiry_initial: "問い合わせ取込の初期",
    is_card_import_initial: "名刺取込の初期",
    is_system_required: "システム必須",
  },
  lead_categories: {
    progress_view: "進捗画面",
    is_sales_qualified: "商談化カテゴリ",
    is_system_required: "システム必須",
  },
  lead_sources: {
    is_inquiry_default: "問い合わせ取込の既定",
    is_inbound_inquiry: "問い合わせ扱い",
    is_card_import_default: "名刺取込の既定",
  },
  account_statuses: {
    is_active_default: "契約中の既定",
    is_churned_default: "解約後の既定",
    is_prospect_default: "契約前の既定",
    is_system_required: "システム必須",
  },
  company_statuses: {
    is_new_default: "新規作成時の既定",
    is_system_required: "システム必須",
  },
  contact_statuses: {
    is_new_default: "新規作成時の既定",
    is_system_required: "システム必須",
  },
  account_types: {
    requires_corporate_fields: "法人向けの入力欄",
    is_company_default: "企業名からの既定",
    is_sole_proprietor_default: "個人事業主の既定",
    is_system_required: "システム必須",
  },
  corporate_types: {
    is_sole_proprietor: "個人事業主",
    is_system_required: "システム必須",
  },
  pipeline_types: {
    is_default: "商談化の既定",
    default_close_months: "クローズ予定の既定",
    is_system_required: "システム必須",
  },
};

/** 列名を画面の呼び名にする。対応が無ければ列名のまま返す（隠さない） */
export function fieldLabel(tableName: string, field: string): string {
  return (
    TABLE_FIELD_LABELS[tableName]?.[field] ??
    COMMON_FIELD_LABELS[field] ??
    field
  );
}

// ---------------------------------------------------------------------------
// 値
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 参照先の名前を引くための対応表（画面が用意する） */
export type NameResolver = (id: string) => string | undefined;

/**
 * 値を読める形にする。
 *
 * - UUID は**人やマスタの名前**へ（引けなければ「他のデータ」と示す。
 *   生の UUID を出しても利用者には意味が無い）
 * - 日時は和式へ。**秒とタイムゾーンは落とす**（履歴の一覧では不要）
 * - null / 空文字は「未設定」
 * - 真偽値は「はい / いいえ」
 */
export function formatValue(value: unknown, resolveName?: NameResolver): string {
  if (value === null || value === undefined || value === "") return "未設定";
  if (typeof value === "boolean") return value ? "はい" : "いいえ";
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    if (UUID_RE.test(value)) {
      const name = resolveName?.(value);
      return name ?? "他のデータ";
    }
    if (ISO_RE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(
          d.getHours()
        ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    if (DATE_RE.test(value)) {
      const [y, m, day] = value.split("-");
      return `${Number(y)}/${Number(m)}/${Number(day)}`;
    }
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }

  // 配列・オブジェクトは要約する（生の JSON を並べない）
  if (Array.isArray(value)) return `${value.length} 件`;
  return "（内容あり）";
}

// ---------------------------------------------------------------------------
// 変更内容
// ---------------------------------------------------------------------------

export type ChangeEntry = { label: string; before: string; after: string };

/**
 * 作成時に出す代表項目。
 *
 * **全カラムの JSON を並べない。** 以前は `_row` をそのまま出しており、
 * 1 セルに数百文字が入って読めなかった。
 */
const SUMMARY_FIELDS = [
  "name",
  "lead_name",
  "contract_display_name",
  "contract_name",
  "last_name",
  "company_name",
  "code",
];

/**
 * 変更内容を「項目名 / 変更前 / 変更後」の並びにする。
 *
 * 作成・削除（`_row` に全体が入る形）は代表項目だけを要約して返す。
 */
export function describeChange(
  tableName: string,
  changed: unknown,
  resolveName?: NameResolver
): ChangeEntry[] {
  if (!changed || typeof changed !== "object") return [];
  const obj = changed as Record<string, unknown>;

  /** 対象の名前。**削除では「何を消したか」が一番知りたい情報**（DB が記録する） */
  const recordName = typeof obj._name === "string" ? obj._name : null;

  // 作成・削除: 行全体が入っている
  if ("_row" in obj) {
    const row = obj._row;
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;

    // **名前が分かればそれで十分。** 作成の記録で全カラムを並べても読めない
    if (recordName) {
      return [{ label: "対象", before: "", after: recordName }];
    }
    for (const key of SUMMARY_FIELDS) {
      const v = r[key];
      if (v === null || v === undefined || v === "") continue;
      return [
        {
          label: fieldLabel(tableName, key),
          before: "",
          after: formatValue(v, resolveName),
        },
      ];
    }
    return [];
  }

  const entries: ChangeEntry[] = recordName
    ? [{ label: "対象", before: "", after: recordName }]
    : [];

  return entries.concat(
    Object.entries(obj)
      .filter(([field]) => field !== "_name")
      .map(([field, value]) => {
        if (value && typeof value === "object" && "old" in value && "new" in value) {
          const v = value as { old: unknown; new: unknown };
          return {
            label: fieldLabel(tableName, field),
            before: formatValue(v.old, resolveName),
            after: formatValue(v.new, resolveName),
          };
        }
        return {
          label: fieldLabel(tableName, field),
          before: "",
          after: formatValue(value, resolveName),
        };
      })
      // 削除の記録では deleted_at / deleted_by が主役ではない（操作列で分かる）
      .filter((e) => e.label !== "削除" && e.label !== "削除者")
  );
}

/** 変更内容を 1 行の文字列にする（一覧のセル用） */
export function describeChangeText(
  tableName: string,
  changed: unknown,
  resolveName?: NameResolver,
  /** 対象レコードの名前。**削除では「何を消したか」が最も知りたい情報** */
  recordName?: string | null
): string {
  const entries = describeChange(tableName, changed, resolveName);
  if (entries.length === 0) return recordName ? recordName : "—";
  return entries
    .map((e) => (e.before ? `${e.label}: ${e.before} → ${e.after}` : `${e.label}: ${e.after}`))
    .join(" / ");
}

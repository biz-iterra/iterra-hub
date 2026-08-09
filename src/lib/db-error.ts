/**
 * PostgreSQL / PostgREST のエラーを利用者向けの日本語に直す。
 *
 * supabase-js の error.message は Postgres が返す英語の生文言
 * （`null value in column "code" of relation "lead_statuses" violates
 * not-null constraint` など）で、そのままトーストに出しても何をすれば
 * よいか分からない。Server Action が error を返す前に必ずここを通す。
 *
 * 方針:
 * - 入力に起因するもの（NOT NULL・CHECK・UNIQUE・桁あふれ）は
 *   `[field] 本文` 形式で返し、画面側が入力欄の近くに出せるようにする
 *   （CLAUDE.md の「フィールド単位のエラーはインライン表示」に合わせる）
 * - 入力と無関係なもの（権限・接続）は文だけを返す
 * - 判定できないものは英語のまま出さず、汎用文言＋原文を括弧で添える
 *   （利用者には意味が伝わり、問い合わせ時には原因が追える）
 */

export type DbErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type DbErrorContext = {
  /** 「リードステータス」など画面上の名称 */
  entityLabel?: string;
  operation?: "create" | "update" | "delete";
};

/**
 * カラム名 → 画面上の呼び名。
 * ここに無いカラムはカラム名をそのまま出す（誤訳より原文の方が追える）。
 */
const COLUMN_LABELS: Record<string, string> = {
  code: "コード",
  slug: "スラッグ",
  name: "名称",
  color: "バッジ色",
  sort_order: "表示順",
  definition: "定義",
  description: "説明",
  stage_id: "リードステージ",
  large_segment_id: "大セグメント",
  small_segment_id: "小セグメント",
  pipeline_type_id: "パイプライン",
  deal_stage_id: "ディールステージ",
  skill_category_id: "スキルカテゴリ",
  temperature_id: "温度感",
  category: "区分",
  condition_type: "条件種別",
  score_delta: "加点値",
  min_score: "下限スコア",
  min_employees: "従業員数（下限）",
  max_employees: "従業員数（上限）",
  min_capital: "資本金（下限）",
  max_capital: "資本金（上限）",
  owner_user_id: "担当者",
  company_id: "事業者情報",
  account_id: "取引先",
  contact_id: "連絡先",
  lead_id: "リード",
};

function labelOf(column: string): string {
  return COLUMN_LABELS[column] ?? column;
}

/** `column "xxx"` / `Key (xxx)=` からカラム名を拾う */
function extractColumn(error: DbErrorLike): string | null {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  const byColumn = text.match(/column "([^"]+)"/);
  if (byColumn) return byColumn[1];
  const byKey = text.match(/Key \(([^)]+)\)=/);
  if (byKey) return byKey[1].split(",")[0].trim();
  return null;
}

/** `constraint "xxx"` から制約名を拾う */
function extractConstraint(error: DbErrorLike): string | null {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  const m = text.match(/constraint "([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * CHECK 制約の文言。
 * 制約名は `chk_<テーブル>_<種別>` / `<テーブル>_<列>_check` の 2 系統がある。
 */
function describeCheckViolation(constraint: string | null): string | null {
  if (!constraint) return null;

  if (/_(code|slug)_format/.test(constraint)) {
    const field = constraint.includes("slug") ? "slug" : "code";
    return `[${field}] ${labelOf(field)}は半角英小文字で始め、半角英数字とアンダースコアのみで入力してください（32文字以内）`;
  }
  if (/_color_format/.test(constraint)) {
    return "[color] バッジ色は # と16進数6桁で入力してください（例: #E53935）";
  }
  if (/_name_length/.test(constraint)) {
    return "[name] 名称の文字数が制限を超えています";
  }
  if (/_sort_order_check/.test(constraint)) {
    return "[sort_order] 表示順は0以上の整数で入力してください";
  }
  if (/_score_delta_check/.test(constraint)) {
    return "[score_delta] 加点値は0以上100以下の整数で入力してください";
  }
  if (/default_close_months/.test(constraint)) {
    return "[default_close_months] クローズ予定日の既定は0以上120以下で入力してください";
  }
  return null;
}

/** UNIQUE 制約の文言。複合キーは「この組み合わせ」と伝える */
function describeUniqueViolation(
  error: DbErrorLike,
  entityLabel: string
): string {
  const constraint = extractConstraint(error);
  const detail = error.details ?? "";
  const keys = detail.match(/Key \(([^)]+)\)=/);
  const columns = keys ? keys[1].split(",").map((c) => c.trim()) : [];

  if (columns.length > 1) {
    const labels = columns.map(labelOf).join("・");
    return `同じ${labels}の組み合わせが既に登録されています。いずれかを変えてください`;
  }
  if (columns.length === 1) {
    const field = columns[0];
    return `[${field}] この${labelOf(field)}は既に使われています。別の値を入力してください`;
  }
  if (constraint?.includes("code") || constraint?.includes("slug")) {
    return "[code] このコードは既に使われています。別の値を入力してください";
  }
  return `同じ${entityLabel}が既に登録されています`;
}

export function toUserMessage(
  error: DbErrorLike | null | undefined,
  context: DbErrorContext = {}
): string {
  if (!error) return "処理に失敗しました";

  const entityLabel = context.entityLabel ?? "データ";
  const raw = (error.message ?? "").trim();
  const code = error.code ?? "";

  switch (code) {
    // NOT NULL 違反。入力欄が画面に無い場合もここに落ちる
    case "23502": {
      const column = extractColumn(error);
      if (column) {
        return `[${column}] ${labelOf(column)}は必須です。値を入力してください`;
      }
      return "必須項目が入力されていません";
    }

    // UNIQUE 違反
    case "23505":
      return describeUniqueViolation(error, entityLabel);

    // 外部キー違反。削除時は「参照されている」、それ以外は「参照先が無い」
    case "23503": {
      if (context.operation === "delete") {
        return `他のデータから参照されているため、この${entityLabel}は削除できません`;
      }
      const column = extractColumn(error);
      if (column) {
        return `[${column}] 選択した${labelOf(column)}が見つかりません。画面を再読み込みして選び直してください`;
      }
      return "参照先のデータが見つかりません。画面を再読み込みしてください";
    }

    // CHECK 違反
    case "23514": {
      const described = describeCheckViolation(extractConstraint(error));
      if (described) return described;
      return `入力値が${entityLabel}の制限に合いません（${raw}）`;
    }

    // 文字数超過
    case "22001":
      return "入力した文字数が上限を超えています";

    // 型変換の失敗（数値欄に文字列が来た等）
    case "22P02":
      return "入力形式が正しくありません";

    // 権限不足 / RLS で弾かれた
    case "42501":
      return "この操作を行う権限がありません";

    // 接続・タイムアウト
    case "57014":
      return "処理に時間がかかりすぎたため中断しました。対象を絞って再度実行してください";

    // PostgREST: 単一行を期待したが 0 行（権限か、既に消えている）
    case "PGRST116":
      return `対象の${entityLabel}が見つかりません。画面を再読み込みしてください`;

    default:
      break;
  }

  // SQLSTATE が無い場合でも文面から拾えるものは拾う（RPC 経由など）
  if (/violates not-null constraint/.test(raw)) {
    const column = extractColumn(error);
    return column
      ? `[${column}] ${labelOf(column)}は必須です。値を入力してください`
      : "必須項目が入力されていません";
  }
  if (/duplicate key value/.test(raw)) {
    return describeUniqueViolation(error, entityLabel);
  }
  if (/violates check constraint/.test(raw)) {
    const described = describeCheckViolation(extractConstraint(error));
    if (described) return described;
  }
  if (/violates row-level security/.test(raw)) {
    return "この操作を行う権限がありません";
  }

  // 日本語（DB 関数が RAISE EXCEPTION で返す業務エラー）はそのまま通す
  if (/[ぁ-んァ-ヶ一-龠]/.test(raw)) return raw;

  return raw ? `処理に失敗しました（${raw}）` : "処理に失敗しました";
}

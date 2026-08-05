-- ============================================================
-- スラッグ／コードへの依存を意味のある列へ置き換える
--
-- 依頼（2026-08-05）:
--   「リードのステージ・ステータス・カテゴリなどで編集できるスラッグ設定を廃止し、
--     裏側で自動採番してほしい（運用が楽）」
--
-- **そのままランダム化すると静かに壊れる箇所が 6 つあった。**
-- スラッグは表示用の識別子のはずが、実際には「この行が何であるか」を
-- コードが判定する鍵になっていた（`slug = 'generation'` で既定ステージを引く等）。
-- ランダムにすると該当なしで NULL が返り、**エラーにならないまま機能が止まる**。
--
-- そこで先に「何であるか」を**意味のある列**で表す。これは既存方針
-- （CLAUDE.md「判定をコードに書かない。lead_stages.requires_deal で表す」）の延長。
--
-- | 置き換える判定 | 新しい表し方 |
-- |---|---|
-- | 問い合わせ取込の既定ステージ（slug='generation'） | lead_stages.is_inquiry_default |
-- | 問い合わせ取込の既定の流入元（slug='web_form'） | lead_sources.is_inquiry_default |
-- | 昇格ステージ（slug='opportunity'） | **既存の auto_promote_to_deal** を使う |
-- | 法人向け項目の出し分け（slug='corporate'/'government'） | account_types.requires_corporate_fields |
-- | 商談化の既定パイプライン（slug='sales'） | pipeline_types.is_default |
-- | 進捗画面のカテゴリ（code='inquiry'/'mql'/'tql'） | lead_categories.progress_view |
--
-- スラッグ列そのものは**消さない**。外部連携の突合や過去データの追跡に使えるため、
-- 「人が編集しない自動採番の値」として残す（自動採番は次のマイグレーション）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 問い合わせ取込の既定（ステージ・流入元）
--
-- コーポレートサイトからの取込（/api/leads/inquiry-sync）が、
-- 新規リードに付ける初期値。**1 行だけ true** にする。
-- ------------------------------------------------------------
ALTER TABLE lead_stages  ADD COLUMN is_inquiry_default BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lead_sources ADD COLUMN is_inquiry_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_stages.is_inquiry_default IS
'問い合わせ取込で新規リードに付ける初期ステージ。1 行だけ true';
COMMENT ON COLUMN lead_sources.is_inquiry_default IS
'問い合わせ取込で新規リードに付ける流入元。1 行だけ true';

-- **2 行が true になると「どちらが使われるか」が不定になる**ので制約で防ぐ
CREATE UNIQUE INDEX uq_lead_stages_inquiry_default
  ON lead_stages ((TRUE)) WHERE is_inquiry_default AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_lead_sources_inquiry_default
  ON lead_sources ((TRUE)) WHERE is_inquiry_default AND deleted_at IS NULL;

UPDATE lead_stages  SET is_inquiry_default = TRUE WHERE slug = 'generation';
UPDATE lead_sources SET is_inquiry_default = TRUE WHERE slug = 'web_form';

-- ------------------------------------------------------------
-- 2. 法人向け項目の出し分け
--
-- リードの入力欄で「法人番号・代表者」等を出すかどうか。
-- 現状は slug が corporate / government のときだけ出していた
-- （個人事業主には出さない。§22.2.1）。
-- ------------------------------------------------------------
ALTER TABLE account_types
  ADD COLUMN requires_corporate_fields BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN account_types.requires_corporate_fields IS
'法人向けの入力欄（法人番号・代表者など）を出すか。個人事業主では出さない';

UPDATE account_types SET requires_corporate_fields = TRUE
 WHERE slug IN ('corporate', 'government');

-- 企業名を入力したときに自動で選ぶ事業者種別。
-- **requires_corporate_fields では特定できない**（法人と官公庁の 2 つが true）ので、
-- 「既定はどれか」を別に持つ。
ALTER TABLE account_types ADD COLUMN is_company_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN account_types.is_company_default IS
'企業名を入れたときに自動で選ぶ事業者種別。1 行だけ true';

CREATE UNIQUE INDEX uq_account_types_company_default
  ON account_types ((TRUE)) WHERE is_company_default AND deleted_at IS NULL;

UPDATE account_types SET is_company_default = TRUE WHERE slug = 'corporate';

-- ------------------------------------------------------------
-- 3. 商談化の既定パイプライン
--
-- リードを商談へ昇格するときに使うパイプライン。
-- ------------------------------------------------------------
ALTER TABLE pipeline_types ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN pipeline_types.is_default IS
'リードの商談化で使う既定のパイプライン。1 行だけ true';

CREATE UNIQUE INDEX uq_pipeline_types_default
  ON pipeline_types ((TRUE)) WHERE is_default AND deleted_at IS NULL;

UPDATE pipeline_types SET is_default = TRUE WHERE slug = 'sales';

-- ------------------------------------------------------------
-- 4. 進捗画面とカテゴリの対応
--
-- /progress/inquiry・/progress/inbound・/progress/outbound の 3 画面が、
-- それぞれどのカテゴリを見るか。**画面の構造と 1:1** なので、
-- マスタを増やしても画面は増えない（増やしたいなら実装が要る）。
-- ------------------------------------------------------------
ALTER TABLE lead_categories ADD COLUMN progress_view TEXT
  CHECK (progress_view IN ('inquiry', 'inbound', 'outbound'));

COMMENT ON COLUMN lead_categories.progress_view IS
'このカテゴリを表示する進捗画面。/progress/<値> と対応する。NULL なら専用画面を持たない';

CREATE UNIQUE INDEX uq_lead_categories_progress_view
  ON lead_categories (progress_view) WHERE progress_view IS NOT NULL AND deleted_at IS NULL;

UPDATE lead_categories SET progress_view = 'inquiry'  WHERE code = 'inquiry';
UPDATE lead_categories SET progress_view = 'inbound'  WHERE code = 'mql';
UPDATE lead_categories SET progress_view = 'outbound' WHERE code = 'tql';

-- ------------------------------------------------------------
-- 5. 進捗集計の関数を「カテゴリ ID」で受けるようにする
--
-- `lead_progress_summary(p_category_code)` / `lead_kanban_cards(p_limit, p_category_code)`
-- はコードで行を引いていた（`WHERE code = p_category_code`）。
-- **画面は既に ID を持っている**（getCategoryIdByCode で引いてから渡していた）ので、
-- 引数を ID に変えて引き直しを無くす。
--
-- 引数の型が変わるので古い版を DROP する。**戻り値の形は変えない**
-- （画面のコンポーネントはそのまま使える）。
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS lead_progress_summary(TEXT);
DROP FUNCTION IF EXISTS lead_kanban_cards(INTEGER, TEXT);

CREATE OR REPLACE FUNCTION lead_progress_summary(p_category_id UUID DEFAULT NULL)
RETURNS TABLE (
  stage_id     UUID,
  stage_name   TEXT,
  stage_slug   TEXT,
  stage_order  INTEGER,
  is_terminal  BOOLEAN,
  status_id    UUID,
  status_name  TEXT,
  status_order INTEGER,
  lead_count   BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- ステージ × ステータスの全組み合わせを返す。**件数 0 の枠も出す。**
  -- 該当が無い行が消えると、どこが空いているのか読み取れない
  SELECT
    s.id, s.name, s.slug, s.sort_order, s.is_terminal,
    st.id, st.name, st.sort_order,
    count(l.id)
    FROM lead_stages s
    LEFT JOIN lead_statuses st ON st.stage_id = s.id AND st.deleted_at IS NULL
    LEFT JOIN leads l
      ON l.stage_id = s.id
     AND (st.id IS NULL OR l.status_id = st.id)
     AND l.deleted_at IS NULL
     AND (p_category_id IS NULL OR l.category_id = p_category_id)
   WHERE s.deleted_at IS NULL
   GROUP BY s.id, s.name, s.slug, s.sort_order, s.is_terminal,
            st.id, st.name, st.sort_order
   ORDER BY s.sort_order, st.sort_order NULLS FIRST;
$$;

COMMENT ON FUNCTION lead_progress_summary(UUID) IS
  'リードをステージ × ステータスで数える。カテゴリは ID で絞る。RLS が効く';

CREATE OR REPLACE FUNCTION lead_kanban_cards(
  p_limit       INTEGER DEFAULT 20,
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
  stage_id          UUID,
  stage_name        TEXT,
  stage_order       INTEGER,
  lead_id           UUID,
  lead_name         TEXT,
  company_name      TEXT,
  score             INTEGER,
  temperature_name  TEXT,
  temperature_color TEXT,
  status_name       TEXT,
  owner_name        TEXT,
  updated_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT
      l.id, l.stage_id, l.lead_name, l.company_name, l.score,
      l.temperature_id, l.status_id, l.owner_user_id, l.updated_at,
      row_number() OVER (
        PARTITION BY l.stage_id
        ORDER BY l.score DESC NULLS LAST, l.updated_at DESC
      ) AS rn
      FROM leads l
     WHERE l.deleted_at IS NULL
       AND (p_category_id IS NULL OR l.category_id = p_category_id)
  )
  SELECT
    s.id, s.name, s.sort_order,
    r.id, r.lead_name, r.company_name, r.score,
    t.name, t.color,
    st.name,
    u.full_name,
    r.updated_at
    FROM lead_stages s
    LEFT JOIN ranked r ON r.stage_id = s.id AND r.rn <= p_limit
    LEFT JOIN lead_temperatures t ON t.id = r.temperature_id
    LEFT JOIN lead_statuses     st ON st.id = r.status_id
    LEFT JOIN crm_users         u ON u.id = r.owner_user_id
   WHERE s.deleted_at IS NULL
   ORDER BY s.sort_order, r.rn;
$$;

COMMENT ON FUNCTION lead_kanban_cards(INTEGER, UUID) IS
  'カンバン用。ステージごとに上位 N 件。カテゴリは ID で絞る';

-- ============================================================
-- ステータス／ステージ系マスタに color を追加する
--
-- 背景:
--   バッジの色が画面ごとに違っていた。原因は色の決め方が2系統あったこと。
--     - deal_statuses / lead_statuses 等: sort_order と総件数から進行度を算出
--     - account/contact/company_statuses: sort_order を持たず id のハッシュ
--   前者は画面が渡す「総件数」がフィルタ状況で変わると色も変わり、
--   後者はそもそもマスタ間で対応が取れない。
--
-- 方針:
--   色をマスタの属性としてDBに持たせ、表示側は受け取った色をそのまま使う。
--   既に color を持つ lead_categories / lead_temperatures /
--   lead_call_statuses / lead_activity_types と同じ扱いに揃える。
--
--   既定値は「意味カテゴリ」で横断的に統一する。マスタが違っても
--   同じ意味の値は同じ色になる（「アクティブ」は取引先でも法人でも同色）。
--
--     開始・新規・見込み   #2563EB (blue)
--     接触・育成           #0E7490 (cyan)
--     進行・提案           #0F766E (teal)
--     交渉・見積           #B88A2E (amber)
--     成功・完了           #4D7A65 (sage)
--     失敗・終了           #B03A2E (red)
--     停止・保留           #6B7280 (gray)
--
--   いずれも白文字が載る濃さにしてある（ソリッド塗りのステージバッジ用）。
--   ソフト塗りが必要な箇所は表示側で透過させる。
-- ============================================================

-- ── カラム追加 ──────────────────────────────────────────────────────────────
ALTER TABLE account_statuses ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE contact_statuses ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE company_statuses ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE deal_statuses    ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE deal_stages      ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE lead_statuses    ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE lead_stages      ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE project_statuses ADD COLUMN IF NOT EXISTS color TEXT;

-- 形式は #RRGGBB に限定する。表示側で色をそのまま style に入れるため、
-- 任意文字列が入ると CSS が壊れる
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'account_statuses','contact_statuses','company_statuses','deal_statuses',
    'deal_stages','lead_statuses','lead_stages','project_statuses'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',
      t, t || '_color_format_check'
    );
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I CHECK (color IS NULL OR color ~ ''^#[0-9A-Fa-f]{6}$'')',
      t, t || '_color_format_check'
    );
  END LOOP;
END $$;

-- ── 既定色 ──────────────────────────────────────────────────────────────────
-- 関数にまとめる。マイグレーション（既存DB向け）と seed（db reset / 新規構築向け）の
-- 双方から呼ぶため、色の定義をここ 1 箇所に閉じる。
--
-- 名前・コードで当てる。運用中に改名された値は NULL のまま残り、
-- 表示側が従来どおりのフォールバック配色を使う。
-- 既に色が入っている行は上書きしない（運用で変えた色を戻さないため）
CREATE OR REPLACE FUNCTION apply_default_status_colors() RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN

UPDATE account_statuses SET color = CASE name
  WHEN '見込み'     THEN '#2563EB'
  WHEN 'アクティブ' THEN '#4D7A65'
  WHEN '休眠'       THEN '#6B7280'
  WHEN '解約'       THEN '#B03A2E'
END WHERE color IS NULL;

UPDATE company_statuses SET color = CASE name
  WHEN '見込み'     THEN '#2563EB'
  WHEN 'アクティブ' THEN '#4D7A65'
  WHEN '休眠'       THEN '#6B7280'
  WHEN '取引停止'   THEN '#B03A2E'
END WHERE color IS NULL;

UPDATE contact_statuses SET color = CASE name
  WHEN '見込み'     THEN '#2563EB'
  WHEN 'アクティブ' THEN '#4D7A65'
  WHEN '休眠'       THEN '#6B7280'
  WHEN '退職'       THEN '#B03A2E'
END WHERE color IS NULL;

UPDATE deal_stages SET color = CASE name
  WHEN 'リード'   THEN '#2563EB'
  WHEN '商談'     THEN '#0E7490'
  WHEN '提案'     THEN '#0F766E'
  WHEN '見積り'   THEN '#B88A2E'
  WHEN '交渉'     THEN '#C2703A'
  WHEN 'クローズ' THEN '#4D7A65'
END WHERE color IS NULL;

UPDATE deal_statuses SET color = CASE name
  WHEN '新規'           THEN '#2563EB'
  WHEN 'コンタクト済み' THEN '#0E7490'
  WHEN '進行中'         THEN '#0F766E'
  WHEN '提案中'         THEN '#0F766E'
  WHEN '見積り提出'     THEN '#B88A2E'
  WHEN '交渉中'         THEN '#C2703A'
  WHEN '受注'           THEN '#4D7A65'
  WHEN '失注'           THEN '#B03A2E'
  WHEN '保留'           THEN '#6B7280'
END WHERE color IS NULL;

UPDATE project_statuses SET color = CASE name
  WHEN '計画中' THEN '#2563EB'
  WHEN '進行中' THEN '#0F766E'
  WHEN '保留'   THEN '#6B7280'
  WHEN '完了'   THEN '#4D7A65'
  WHEN '中止'   THEN '#B03A2E'
END WHERE color IS NULL;

-- リードのステージはファネルの進行そのものなので、開始→完了で並べる
UPDATE lead_stages SET color = CASE slug
  WHEN 'generation'    THEN '#2563EB'
  WHEN 'nurturing'     THEN '#0E7490'
  WHEN 'qualification' THEN '#0F766E'
  WHEN 'sales'         THEN '#B88A2E'
  WHEN 'opportunity'   THEN '#C2703A'
  WHEN 'customer'      THEN '#4D7A65'
  WHEN 'dead'          THEN '#B03A2E'
END WHERE color IS NULL;

-- リードのステータスは sort_order がグループ内の並び順で、進行度を表さない。
-- 意味カテゴリで直接割り当てる
UPDATE lead_statuses SET color = CASE code
  WHEN 'not_started'            THEN '#2563EB'
  WHEN 'list_ready'             THEN '#2563EB'
  WHEN 'not_called'             THEN '#2563EB'
  WHEN 'calling'                THEN '#0E7490'
  WHEN 'continuing_call'        THEN '#0E7490'
  WHEN 'awaiting_recall'        THEN '#0E7490'
  WHEN 'call_scheduled'         THEN '#0E7490'
  WHEN 'material_sent'          THEN '#0E7490'
  WHEN 'card_exchanged'         THEN '#0E7490'
  WHEN 'negotiation'            THEN '#0F766E'
  WHEN 'appointment_obtained'   THEN '#B88A2E'
  WHEN 'appointment_confirmed'  THEN '#B88A2E'
  WHEN 'closed_won'             THEN '#4D7A65'
  WHEN 'handed_over'            THEN '#4D7A65'
  WHEN 'lost'                   THEN '#B03A2E'
  WHEN 'declined'               THEN '#B03A2E'
  WHEN 'unreachable'            THEN '#B03A2E'
  WHEN 'opt_out'                THEN '#B03A2E'
  WHEN 'approach_prohibited'    THEN '#B03A2E'
END WHERE color IS NULL;

END;
$fn$;

COMMENT ON FUNCTION apply_default_status_colors() IS
  'ステータス／ステージ系マスタの既定色を設定する。色が未設定の行のみ対象。マイグレーションと seed の双方から呼ぶ';

SELECT apply_default_status_colors();

COMMENT ON COLUMN account_statuses.color IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';
COMMENT ON COLUMN contact_statuses.color IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';
COMMENT ON COLUMN company_statuses.color IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';
COMMENT ON COLUMN deal_statuses.color    IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';
COMMENT ON COLUMN deal_stages.color      IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';
COMMENT ON COLUMN lead_statuses.color    IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';
COMMENT ON COLUMN lead_stages.color      IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';
COMMENT ON COLUMN project_statuses.color IS 'バッジ色 #RRGGBB。NULL は表示側のフォールバック配色';

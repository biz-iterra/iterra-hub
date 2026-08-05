-- ============================================================
-- マスタの「役割」を列で表す（残り 15 箇所の名指しを解消する）
--
-- 経緯（2026-08-05）:
--   利用者から「他にも自動付与で編集・削除できてしまうものが無いか」と
--   確認を受けて全体を洗ったところ、**15 箇所**見つかった。
--   `pg_get_functiondef` の全文検索とアプリの grep を機械的にかけた結果。
--
--   内訳:
--     - **UUID 直書き 3 件**（最も危険。seed の UUID に依存しており、
--       本番でマスタを作り直すと外部キー違反で保存が失敗する）
--     - DB 関数が name / code で名指し 8 件
--       （**name 名指しは改名しただけで壊れる**。名前は自由に変えられる）
--     - アプリが name / code で名指し 4 件
--
-- 方針: **「この行が何であるか」は役割フラグで表す。**
-- 名前・コード・UUID で引かない。改名は今までどおり自由にできる
-- （役割はフラグが持つので、表示名を業務に合わせて変えても壊れない）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 取引先ステータス（account_statuses）
--
-- resolve_account_status が code = 'active'/'churned'/'prospect' で引いていた。
-- 契約の有無とリードの状態から自動判定する仕組みの拠り所。
-- ------------------------------------------------------------
ALTER TABLE account_statuses
  ADD COLUMN is_active_default   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_churned_default  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_prospect_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required  BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN account_statuses.is_active_default IS
'契約が生きている取引先に自動で付くステータス。1 行だけ true';
COMMENT ON COLUMN account_statuses.is_churned_default IS
'契約が終了した取引先に自動で付くステータス。1 行だけ true';
COMMENT ON COLUMN account_statuses.is_prospect_default IS
'契約前（見込み）の取引先に自動で付くステータス。1 行だけ true';

CREATE UNIQUE INDEX uq_account_statuses_active_default
  ON account_statuses ((TRUE)) WHERE is_active_default AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_account_statuses_churned_default
  ON account_statuses ((TRUE)) WHERE is_churned_default AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_account_statuses_prospect_default
  ON account_statuses ((TRUE)) WHERE is_prospect_default AND deleted_at IS NULL;

UPDATE account_statuses SET is_active_default   = TRUE WHERE code = 'active';
UPDATE account_statuses SET is_churned_default  = TRUE WHERE code = 'churned';
UPDATE account_statuses SET is_prospect_default = TRUE WHERE code = 'prospect';
UPDATE account_statuses SET is_system_required  = TRUE
 WHERE is_active_default OR is_churned_default OR is_prospect_default;

-- ------------------------------------------------------------
-- 2. 事業者ステータス（company_statuses）
--
-- 名刺取込・freee 取込で新規作成するときの初期値（code = 'unverified'）。
-- ------------------------------------------------------------
ALTER TABLE company_statuses
  ADD COLUMN is_new_default     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN company_statuses.is_new_default IS
'取込などで事業者情報を新しく作るときの初期ステータス。1 行だけ true';

CREATE UNIQUE INDEX uq_company_statuses_new_default
  ON company_statuses ((TRUE)) WHERE is_new_default AND deleted_at IS NULL;

UPDATE company_statuses SET is_new_default = TRUE WHERE code = 'unverified';
UPDATE company_statuses SET is_system_required = TRUE WHERE is_new_default;

-- ------------------------------------------------------------
-- 3. 連絡先ステータス（contact_statuses）
--
-- name = 'アクティブ' で引いていた。**改名しただけで壊れる**状態だった。
-- ------------------------------------------------------------
ALTER TABLE contact_statuses
  ADD COLUMN is_new_default     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN contact_statuses.is_new_default IS
'取込などで連絡先を新しく作るときの初期ステータス。1 行だけ true';

CREATE UNIQUE INDEX uq_contact_statuses_new_default
  ON contact_statuses ((TRUE)) WHERE is_new_default AND deleted_at IS NULL;

UPDATE contact_statuses SET is_new_default = TRUE WHERE name = 'アクティブ';
UPDATE contact_statuses SET is_system_required = TRUE WHERE is_new_default;

-- ------------------------------------------------------------
-- 4. 事業種別（corporate_types）
--
-- name = '個人事業主' で引いていた（freee の法人/個人判定と実在性チェック）。
-- ------------------------------------------------------------
ALTER TABLE corporate_types
  ADD COLUMN is_sole_proprietor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN corporate_types.is_sole_proprietor IS
'個人事業主。法人番号を持たず、freee では「個人」として扱う。1 行だけ true';

CREATE UNIQUE INDEX uq_corporate_types_sole_proprietor
  ON corporate_types ((TRUE)) WHERE is_sole_proprietor AND deleted_at IS NULL;

UPDATE corporate_types SET is_sole_proprietor = TRUE WHERE name = '個人事業主';
UPDATE corporate_types SET is_system_required = TRUE WHERE is_sole_proprietor;

-- ------------------------------------------------------------
-- 5. 顧客行動タイプ（lead_customer_activity_types）
--
-- 問い合わせ取込が code = 'form_submit' で引いていた。
-- ------------------------------------------------------------
ALTER TABLE lead_customer_activity_types
  ADD COLUMN is_form_submit     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_customer_activity_types.is_form_submit IS
'問い合わせフォームの送信。サイトからの取込で自動記録する種別。1 行だけ true';

CREATE UNIQUE INDEX uq_lead_customer_activity_types_form_submit
  ON lead_customer_activity_types ((TRUE))
 WHERE is_form_submit AND deleted_at IS NULL;

UPDATE lead_customer_activity_types SET is_form_submit = TRUE WHERE code = 'form_submit';
UPDATE lead_customer_activity_types SET is_system_required = TRUE WHERE is_form_submit;

-- ------------------------------------------------------------
-- 6. 名刺交換の記録に使うマスタ（Eight 取込）
--
-- lead_activity_types / lead_call_statuses を code = 'card_exchange' で
-- 引いていた。取込のたびに「名刺交換」の記録を残すため。
-- ------------------------------------------------------------
ALTER TABLE lead_activity_types
  ADD COLUMN is_card_exchange   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lead_call_statuses
  ADD COLUMN is_card_exchange   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_activity_types.is_card_exchange IS
'名刺交換。Eight 取込が自動記録する対応種別。1 行だけ true';
COMMENT ON COLUMN lead_call_statuses.is_card_exchange IS
'名刺交換。Eight 取込が自動記録するコールステータス。1 行だけ true';

CREATE UNIQUE INDEX uq_lead_activity_types_card_exchange
  ON lead_activity_types ((TRUE)) WHERE is_card_exchange AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_lead_call_statuses_card_exchange
  ON lead_call_statuses ((TRUE)) WHERE is_card_exchange AND deleted_at IS NULL;

UPDATE lead_activity_types SET is_card_exchange = TRUE WHERE code = 'card_exchange';
UPDATE lead_call_statuses  SET is_card_exchange = TRUE WHERE code = 'card_exchange';
UPDATE lead_activity_types SET is_system_required = TRUE WHERE is_card_exchange;
UPDATE lead_call_statuses  SET is_system_required = TRUE WHERE is_card_exchange;

-- ------------------------------------------------------------
-- 7. リードステータス（lead_statuses）
--
-- 取込が code = 'not_started' / 'card_exchanged' で引いていた。
-- **ステージごとに違う初期ステータスを付ける**ため、ステージ単位で 1 行にする。
-- ------------------------------------------------------------
-- **取込の経路ごとに初期ステータスが違う。** 同じ「獲得」ステージでも、
-- 問い合わせは「未着手」、名刺取込は「名刺交換済」を付ける。
-- ステージ単位で 1 行にすると両立しないので、用途ごとに列を分ける
ALTER TABLE lead_statuses
  ADD COLUMN is_inquiry_initial    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_card_import_initial BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_system_required    BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_statuses.is_inquiry_initial IS
'問い合わせ取込で新規リードに付ける初期ステータス。1 行だけ true';
COMMENT ON COLUMN lead_statuses.is_card_import_initial IS
'名刺（Eight）取込で新規リードに付ける初期ステータス。1 行だけ true';

CREATE UNIQUE INDEX uq_lead_statuses_inquiry_initial
  ON lead_statuses ((TRUE)) WHERE is_inquiry_initial AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_lead_statuses_card_import_initial
  ON lead_statuses ((TRUE)) WHERE is_card_import_initial AND deleted_at IS NULL;

UPDATE lead_statuses SET is_inquiry_initial     = TRUE WHERE code = 'not_started';
UPDATE lead_statuses SET is_card_import_initial = TRUE WHERE code = 'card_exchanged';
UPDATE lead_statuses SET is_system_required = TRUE
 WHERE is_inquiry_initial OR is_card_import_initial;

-- ------------------------------------------------------------
-- 8. Eight 取込の流入元（lead_sources）
--
-- slug = 'eight' で引いていた。
-- ------------------------------------------------------------
ALTER TABLE lead_sources ADD COLUMN is_card_import_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_sources.is_card_import_default IS
'名刺（Eight）取込で付ける流入元。1 行だけ true';

CREATE UNIQUE INDEX uq_lead_sources_card_import_default
  ON lead_sources ((TRUE)) WHERE is_card_import_default AND deleted_at IS NULL;

UPDATE lead_sources SET is_card_import_default = TRUE WHERE slug = 'eight';

-- ------------------------------------------------------------
-- 9. 削除保護をこれらのマスタへ広げる
--
-- 20260805000020 で作った prevent_system_required_delete を使い回す。
-- **役割を持つ行は消せない。** 役割を持たない行は今までどおり消せる。
-- ------------------------------------------------------------
CREATE TRIGGER trg_account_statuses_protect
  BEFORE UPDATE OR DELETE ON account_statuses
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_company_statuses_protect
  BEFORE UPDATE OR DELETE ON company_statuses
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_contact_statuses_protect
  BEFORE UPDATE OR DELETE ON contact_statuses
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_corporate_types_protect
  BEFORE UPDATE OR DELETE ON corporate_types
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_lead_customer_activity_types_protect
  BEFORE UPDATE OR DELETE ON lead_customer_activity_types
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_lead_activity_types_protect
  BEFORE UPDATE OR DELETE ON lead_activity_types
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_lead_call_statuses_protect
  BEFORE UPDATE OR DELETE ON lead_call_statuses
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();

-- lead_statuses は「使用中は消せない」トリガーが既にある。
-- **両方を通す**（システム必須 かつ 使用中の可能性がある）
CREATE TRIGGER trg_lead_statuses_protect
  BEFORE UPDATE OR DELETE ON lead_statuses
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();

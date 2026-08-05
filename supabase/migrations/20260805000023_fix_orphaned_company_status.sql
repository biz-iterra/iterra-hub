-- ============================================================
-- 削除済みステータスを指している事業者情報を直す
--
-- 発覚（2026-08-05。利用者の「他にも自動付与で壊れるものは無いか」の確認から）:
--   `companies` の 27 件が**論理削除済みの company_statuses**（旧「アクティブ」）を
--   指していた。
--
-- 原因:
--   2026-07-31（20260731000010）で事業者ステータスを「取引状態」から
--   「実在性」へ入れ替えた際、**既存行の移行は正しく行われていた**。
--   しかしアプリ側に UUID が直書きされたままだった:
--
--     export const COMPANY_STATUS_ACTIVE = "c1000000-0000-0000-0000-000000000001";
--
--   これはリード昇格で作る事業者情報に付けられており、**移行後も
--   削除済みの行を指す新規データを作り続けていた**（8/4〜8/5 の 27 件）。
--   外部キーは生きている（論理削除なので）ため、エラーは一切出ない。
--
-- **UUID の直書きが最も危険**な理由がこれ。名前やコードなら「見つからない」で
-- 気づけるが、UUID は消えた行でも参照が通ってしまう。
-- 直書きはアプリ側から廃止し（役割フラグで引く）、ここでは既存データを直す。
-- ============================================================

DO $$
DECLARE
  v_new_default UUID;
  v_moved       INTEGER;
BEGIN
  SELECT id INTO v_new_default
    FROM company_statuses
   WHERE is_new_default AND deleted_at IS NULL
   LIMIT 1;

  IF v_new_default IS NULL THEN
    RAISE EXCEPTION '新規作成時の既定ステータス（is_new_default）が設定されていません';
  END IF;

  -- **削除済みのステータスを指している行だけ**を移す。
  -- 生きているステータス（実在確認済など）は人が判断した結果なので触らない
  UPDATE companies c
     SET company_status_id = v_new_default
   WHERE EXISTS (
     SELECT 1 FROM company_statuses s
      WHERE s.id = c.company_status_id
        AND s.deleted_at IS NOT NULL
   );
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RAISE NOTICE '削除済みステータスを指していた事業者情報: % 件を既定へ移した', v_moved;
END $$;

-- ------------------------------------------------------------
-- 同じことが起きていないか、他のマスタ参照も直す
--
-- 連絡先・取引先も「削除済みのステータスを指していないか」を見る。
-- 対象があれば既定へ寄せ、無ければ何もしない。
-- ------------------------------------------------------------
DO $$
DECLARE
  v_default UUID;
  v_moved   INTEGER;
BEGIN
  SELECT id INTO v_default FROM contact_statuses
   WHERE is_new_default AND deleted_at IS NULL LIMIT 1;

  IF v_default IS NOT NULL THEN
    UPDATE contacts c
       SET contact_status_id = v_default
     WHERE EXISTS (
       SELECT 1 FROM contact_statuses s
        WHERE s.id = c.contact_status_id AND s.deleted_at IS NOT NULL
     );
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    RAISE NOTICE '連絡先: % 件', v_moved;
  END IF;

  SELECT id INTO v_default FROM account_statuses
   WHERE is_prospect_default AND deleted_at IS NULL LIMIT 1;

  IF v_default IS NOT NULL THEN
    UPDATE accounts a
       SET account_status_id = v_default
     WHERE EXISTS (
       SELECT 1 FROM account_statuses s
        WHERE s.id = a.account_status_id AND s.deleted_at IS NOT NULL
     );
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    RAISE NOTICE '取引先: % 件', v_moved;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 再発防止: 削除済みのマスタを新たに参照させない
--
-- **論理削除は外部キーで防げない。** 参照先が消えていても FK は通る。
-- 新規作成・更新のときだけ検査する（既存データの遡及検査はしない。
-- 上で直したものが再び壊れないようにするのが目的）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_master_not_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table  TEXT := TG_ARGV[0];
  v_column TEXT := TG_ARGV[1];
  v_label  TEXT := TG_ARGV[2];
  v_id     UUID;
  v_gone   BOOLEAN;
BEGIN
  EXECUTE format('SELECT ($1).%I', v_column) INTO v_id USING NEW;
  IF v_id IS NULL THEN RETURN NEW; END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I WHERE id = $1 AND deleted_at IS NOT NULL)', v_table
  ) INTO v_gone USING v_id;

  IF v_gone THEN
    RAISE EXCEPTION '削除済みの%を指定しています。有効なものを選び直してください', v_label;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_master_not_deleted IS
'削除済みのマスタを新たに参照させない。論理削除は外部キーで防げないため';

CREATE TRIGGER trg_companies_status_alive
  BEFORE INSERT OR UPDATE OF company_status_id ON companies
  FOR EACH ROW EXECUTE FUNCTION check_master_not_deleted(
    'company_statuses', 'company_status_id', '事業者ステータス');

CREATE TRIGGER trg_contacts_status_alive
  BEFORE INSERT OR UPDATE OF contact_status_id ON contacts
  FOR EACH ROW EXECUTE FUNCTION check_master_not_deleted(
    'contact_statuses', 'contact_status_id', '連絡先ステータス');

CREATE TRIGGER trg_accounts_status_alive
  BEFORE INSERT OR UPDATE OF account_status_id ON accounts
  FOR EACH ROW EXECUTE FUNCTION check_master_not_deleted(
    'account_statuses', 'account_status_id', '取引先ステータス');

CREATE TRIGGER trg_leads_stage_alive
  BEFORE INSERT OR UPDATE OF stage_id ON leads
  FOR EACH ROW EXECUTE FUNCTION check_master_not_deleted(
    'lead_stages', 'stage_id', 'リードステージ');

CREATE TRIGGER trg_leads_status_alive
  BEFORE INSERT OR UPDATE OF status_id ON leads
  FOR EACH ROW EXECUTE FUNCTION check_master_not_deleted(
    'lead_statuses', 'status_id', 'リードステータス');

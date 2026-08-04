-- ============================================================
-- 取引先のステータスを契約とリードから自動で決める
--
-- 背景（2026-08-04 の依頼）:
--   取引先のステータスを人が選ぶと、契約の実態と食い違ったまま放置される。
--   実態（契約が生きているか）から機械的に決められる値なので自動付与にする。
--
-- 規則（利用者の指定）:
--   アクティブ … 期間内の契約がある
--   解約       … 契約はあるが、すべて終了している
--   見込み     … 契約が無く、リードが Sales 以上まで進んでいる
--   （契約が無くリードも進んでいない取引先は、いまの値のままにする。
--     契約成立時にしか取引先は作られないため、通常はここに来ない）
--
--   **「休眠」は廃止する。** 使われておらず、上の 3 つで表せない状態が無い。
--
-- 事業者情報（company_statuses）のステータスは実在性を表し、法人番号 Web-API の
-- 照合結果で自動付与される別の軸。こちらは触らない（画面から編集項目を外すだけ）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 「休眠」の廃止
-- ------------------------------------------------------------
-- 使っている取引先がいれば見込みへ寄せてから消す（現状 0 件だが、
-- 本番に残っていても壊れないようにしておく）
UPDATE accounts
   SET account_status_id = (SELECT id FROM account_statuses WHERE code = 'prospect')
 WHERE account_status_id = (SELECT id FROM account_statuses WHERE code = 'inactive');

UPDATE account_statuses
   SET deleted_at = now(),
       deletion_reason = '契約の実態から自動判定するようにしたため廃止（20260805000005）'
 WHERE code = 'inactive' AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. 判定関数
--
-- 1 取引先分だけを見る。全件の洗い替えは 3 の関数が回す。
-- STABLE ではなく VOLATILE（UPDATE するため）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_account_status(p_account_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_active   BOOLEAN;
  v_has_any      BOOLEAN;
  v_has_sales_lead BOOLEAN;
  v_status_id    UUID;
BEGIN
  -- 期間内の契約。end_date が無いものは継続中として扱う
  -- （解約日が入っていれば、その日を過ぎた時点で終了）
  SELECT EXISTS (
    SELECT 1
      FROM contracts c
      JOIN deals d ON d.id = c.deal_id
     WHERE d.account_id = p_account_id
       AND c.deleted_at IS NULL
       AND (c.start_date IS NULL OR c.start_date <= CURRENT_DATE)
       AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
       AND (c.cancellation_date IS NULL OR c.cancellation_date > CURRENT_DATE)
  ) INTO v_has_active;

  SELECT EXISTS (
    SELECT 1
      FROM contracts c
      JOIN deals d ON d.id = c.deal_id
     WHERE d.account_id = p_account_id
       AND c.deleted_at IS NULL
  ) INTO v_has_any;

  IF v_has_active THEN
    SELECT id INTO v_status_id FROM account_statuses WHERE code = 'active';
  ELSIF v_has_any THEN
    -- 契約はあったが今は生きていない
    SELECT id INTO v_status_id FROM account_statuses WHERE code = 'churned';
  ELSE
    -- 契約が無い。リードが Sales 以降（requires_deal なステージ）まで
    -- 進んでいれば見込みとする（§24 のステージ要件と同じ基準を使う）
    SELECT EXISTS (
      SELECT 1
        FROM leads l
        JOIN lead_stages s ON s.id = l.stage_id
       WHERE l.deleted_at IS NULL
         AND s.requires_deal
         AND l.promoted_account_id = p_account_id
    ) INTO v_has_sales_lead;

    IF v_has_sales_lead THEN
      SELECT id INTO v_status_id FROM account_statuses WHERE code = 'prospect';
    END IF;
  END IF;

  -- 決められないときは現状維持（NULL を返して呼び出し側に判断させない）
  IF v_status_id IS NULL THEN
    SELECT account_status_id INTO v_status_id FROM accounts WHERE id = p_account_id;
  END IF;

  UPDATE accounts
     SET account_status_id = v_status_id
   WHERE id = p_account_id
     AND account_status_id IS DISTINCT FROM v_status_id;

  RETURN v_status_id;
END;
$$;

COMMENT ON FUNCTION resolve_account_status IS
'取引先のステータスを契約とリードの実態から決めて反映する。決められないときは現状維持';

-- ------------------------------------------------------------
-- 3. 契約が変わったら、その取引先を判定し直す
--
-- 期間の経過による切り替わり（end_date を過ぎて解約になる等）は
-- この経路では拾えないため、4 の日次ジョブが受け持つ。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_account_status_from_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  SELECT d.account_id INTO v_account_id
    FROM deals d
   WHERE d.id = COALESCE(NEW.deal_id, OLD.deal_id);

  IF v_account_id IS NOT NULL THEN
    PERFORM resolve_account_status(v_account_id);
  END IF;

  RETURN NULL;  -- AFTER トリガーなので戻り値は使われない
END;
$$;

DROP TRIGGER IF EXISTS trg_account_status_from_contract ON contracts;
CREATE TRIGGER trg_account_status_from_contract
  AFTER INSERT OR UPDATE OF start_date, end_date, cancellation_date, deleted_at, deal_id
     OR DELETE
  ON contracts
  FOR EACH ROW EXECUTE FUNCTION refresh_account_status_from_contract();

-- ------------------------------------------------------------
-- 4. 全件の洗い替え（日次）
--
-- 契約の開始日・終了日をまたいだ切り替わりは時間の経過で起きるので、
-- イベントでは拾えない。pg_cron で毎日回す。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_all_account_statuses()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM accounts WHERE deleted_at IS NULL
  LOOP
    PERFORM resolve_account_status(r.id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION refresh_all_account_statuses IS
'取引先ステータスの日次洗い替え。契約期間の経過による切り替わりを拾う';

ALTER FUNCTION refresh_all_account_statuses() SET statement_timeout = '300s';

REVOKE ALL ON FUNCTION resolve_account_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION refresh_all_account_statuses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_account_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_all_account_statuses() TO service_role;

-- 毎日 04:10（JST 13:10）。他のジョブと時刻をずらす
SELECT cron.schedule(
  'refresh_all_account_statuses',
  '10 4 * * *',
  $$SELECT refresh_all_account_statuses();$$
);

-- ------------------------------------------------------------
-- 5. 既存データを一度そろえる
-- ------------------------------------------------------------
SELECT refresh_all_account_statuses();

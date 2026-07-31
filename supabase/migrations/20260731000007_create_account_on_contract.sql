-- ============================================================
-- 契約が登録されたら取引先（Account）を作る
--
-- 背景:
--   取引先は「契約主体」なので、契約が成立して初めて作る運用に変えた。
--   商談は company_id / contact_id で相手を持ったまま契約まで進み、
--   契約の登録時にここで Account に昇格する。
--
-- なぜトリガーか:
--   Server Action から契約 INSERT → Account 作成と 2 回に分けると、
--   間で失敗したときに「契約はあるが取引先が無い」状態が残る。
--   AFTER INSERT トリガーなら契約と同一トランザクションで完結し、
--   SQL 直接操作や将来の別経路からの登録でも同じ結果になる。
--   （変更履歴を entity_change_logs のトリガーに寄せているのと同じ理由）
--
-- SECURITY DEFINER:
--   契約を登録する manager が商談の担当者とは限らない。
--   deals の UPDATE ポリシーは owner / admin に限定されているため、
--   呼び出しユーザーの権限のままでは紐付けが 0 行更新で静かに失敗する。
--   契約成立に伴う自動処理として定義者権限で実行する。
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_account_on_contract() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deal       deals%ROWTYPE;
  v_company    companies%ROWTYPE;
  v_contact    contacts%ROWTYPE;
  v_account_id UUID;
  v_type_id    UUID;
  v_status_id  UUID;
  v_name       TEXT;
  v_actor      UUID := COALESCE(auth.uid(), NEW.created_by, NEW.registered_by);
BEGIN
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_deal FROM deals WHERE id = NEW.deal_id;
  IF NOT FOUND OR v_deal.account_id IS NOT NULL THEN
    -- 既に取引先がある商談は触らない
    RETURN NEW;
  END IF;

  IF v_deal.company_id IS NOT NULL THEN
    SELECT * INTO v_company FROM companies WHERE id = v_deal.company_id;
  END IF;
  IF v_deal.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact FROM contacts WHERE id = v_deal.contact_id;
  END IF;

  -- 取引先名は法人名を優先し、個人取引なら担当者名を使う
  v_name := COALESCE(
    v_company.name,
    NULLIF(btrim(COALESCE(v_contact.last_name, '') || ' ' || COALESCE(v_contact.first_name, '')), ''),
    v_deal.name
  );

  IF v_name IS NULL THEN
    -- 相手を特定できないまま取引先は作れない。契約自体は成立させる
    RETURN NEW;
  END IF;

  SELECT id INTO v_type_id FROM account_types
   WHERE slug = CASE WHEN v_deal.company_id IS NOT NULL THEN 'corporate' ELSE 'sole_proprietor' END
     AND deleted_at IS NULL
   LIMIT 1;

  SELECT id INTO v_status_id FROM account_statuses
   WHERE name = 'アクティブ' AND deleted_at IS NULL LIMIT 1;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id FROM account_statuses
     WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1;
  END IF;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'account_statuses が未投入です';
  END IF;

  INSERT INTO accounts (
    name, company_id, account_type_id, account_status_id,
    lead_source_id, owner_user_id, created_by
  ) VALUES (
    v_name, v_deal.company_id, v_type_id, v_status_id,
    v_company.lead_source_id, COALESCE(v_deal.owner_user_id, v_actor), v_actor
  ) RETURNING id INTO v_account_id;

  -- 商談の相手担当者をそのまま取引先の主担当にする
  IF v_deal.contact_id IS NOT NULL THEN
    INSERT INTO account_contacts (account_id, contact_id, role)
    VALUES (v_account_id, v_deal.contact_id, 'primary')
    ON CONFLICT (account_id, contact_id) DO NOTHING;
  END IF;

  UPDATE deals SET account_id = v_account_id WHERE id = v_deal.id;

  -- 昇格元のリードにも取引先を記録する（リードから辿れるようにする）
  UPDATE leads
     SET promoted_account_id = v_account_id
   WHERE promoted_deal_id = v_deal.id
     AND promoted_account_id IS NULL;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ensure_account_on_contract() IS
  '契約の登録時に、取引先が未作成の商談へ取引先を作って紐付ける。契約と同一トランザクションで実行される';

DROP TRIGGER IF EXISTS trg_contracts_ensure_account ON contracts;
CREATE TRIGGER trg_contracts_ensure_account
  AFTER INSERT ON contracts
  FOR EACH ROW EXECUTE FUNCTION ensure_account_on_contract();

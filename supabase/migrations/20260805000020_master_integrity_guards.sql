-- ============================================================
-- マスタの整合性を DB で守る
--
-- 経緯（2026-08-05）:
--   スラッグの自動採番（20260805000019）にあたり「判定に使っている参照を
--   すべて意味のある列へ移した」と報告したが、**DB 関数の中を見落としていた**。
--   利用者からの確認で発覚した。残っていたのは 2 つで、どちらも
--   **エラーを出さずに静かに壊れる**種類:
--
--   ① resolve_lead_category  … カテゴリ判定が stage/source の slug を見ていた。
--      新しく作ったステージはスラッグがランダムなので、**必ず mql に落ちる**。
--      進捗画面の分類が実態とずれるが、例外は出ない
--   ② ensure_account_on_contract … 契約から取引先を作るとき
--      account_types.slug = 'corporate'/'sole_proprietor' で種別を引いていた。
--      種別を作り直すと**取引先の種別が空のまま作られる**
--
-- 併せて、**利用者の手動設定でシステムが壊れないようにする**（依頼）。
-- マスタ管理は admin が自由に編集できるため、業務の骨格に関わる行を
-- 消されるとリードの保存や取引先の自動生成が止まる。
-- ============================================================

-- ------------------------------------------------------------
-- 1. カテゴリ判定をスラッグから外す
--
-- 何で決まるかを**マスタの列で表す**（既存方針の延長）。
--   - ステージ側: 商談を伴うか（requires_deal）、選定段階か（新設の is_qualification）
--   - 流入元側: 相手から来たものか（新設の is_inbound_inquiry）
--   - カテゴリ側: どれがどの区分か（既存の progress_view ＋ 新設の is_sales_qualified）
-- ------------------------------------------------------------

-- 選定段階（TQL の判定に使う）
ALTER TABLE lead_stages ADD COLUMN is_qualification BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN lead_stages.is_qualification IS
'選定段階。ここに来たリードは TQL として数える（カテゴリの自動判定に使う）';

UPDATE lead_stages SET is_qualification = TRUE WHERE slug = 'qualification';

-- 相手から来た流入か（Inquiry の判定に使う）。
-- **is_inquiry_default とは別物**。あちらは「取込時に付ける既定」で 1 行だけ、
-- こちらは「この経路は問い合わせ扱い」で複数あってよい
ALTER TABLE lead_sources ADD COLUMN is_inbound_inquiry BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN lead_sources.is_inbound_inquiry IS
'相手から来た流入か。true なら Inquiry として数える（こちらから作った接点は MQL）';

UPDATE lead_sources SET is_inbound_inquiry = TRUE WHERE slug = 'web_form';

-- 商談化以降のカテゴリ（SQL）
ALTER TABLE lead_categories ADD COLUMN is_sales_qualified BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN lead_categories.is_sales_qualified IS
'商談を伴うステージのリードを入れるカテゴリ（SQL）。1 行だけ true';

CREATE UNIQUE INDEX uq_lead_categories_sales_qualified
  ON lead_categories ((TRUE)) WHERE is_sales_qualified AND deleted_at IS NULL;

UPDATE lead_categories SET is_sales_qualified = TRUE WHERE code = 'sql';

-- 判定本体。**スラッグを一切見ない**
CREATE OR REPLACE FUNCTION resolve_lead_category(
  p_lead_source_id UUID,
  p_stage_id       UUID
) RETURNS UUID
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_requires_deal    BOOLEAN := FALSE;
  v_is_qualification BOOLEAN := FALSE;
  v_is_inbound       BOOLEAN := FALSE;
  v_category_id      UUID;
BEGIN
  SELECT requires_deal, is_qualification
    INTO v_requires_deal, v_is_qualification
    FROM lead_stages WHERE id = p_stage_id;

  SELECT is_inbound_inquiry INTO v_is_inbound
    FROM lead_sources WHERE id = p_lead_source_id;

  -- ステージが優先。商談を伴うなら SQL
  IF COALESCE(v_requires_deal, FALSE) THEN
    SELECT id INTO v_category_id FROM lead_categories
     WHERE is_sales_qualified AND deleted_at IS NULL LIMIT 1;
  ELSIF COALESCE(v_is_qualification, FALSE) THEN
    SELECT id INTO v_category_id FROM lead_categories
     WHERE progress_view = 'outbound' AND deleted_at IS NULL LIMIT 1;
  ELSIF COALESCE(v_is_inbound, FALSE) THEN
    SELECT id INTO v_category_id FROM lead_categories
     WHERE progress_view = 'inquiry' AND deleted_at IS NULL LIMIT 1;
  ELSE
    SELECT id INTO v_category_id FROM lead_categories
     WHERE progress_view = 'inbound' AND deleted_at IS NULL LIMIT 1;
  END IF;

  RETURN v_category_id;  -- 該当が無ければ NULL（カテゴリ無しのリードになる）
END;
$$;

COMMENT ON FUNCTION resolve_lead_category(UUID, UUID) IS
  'リードのカテゴリをステージと流入元から決める。ステージが優先。**スラッグは見ない**';

-- ------------------------------------------------------------
-- 2. 契約からの取引先自動生成をスラッグから外す
--
-- 法人か個人事業主かで種別を選んでいた。
-- **個人事業主側にも印が要る**（法人は is_company_default で表せるが、
-- 個人事業主は「既定ではない法人以外」では特定できない）。
-- ------------------------------------------------------------
ALTER TABLE account_types ADD COLUMN is_sole_proprietor_default BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN account_types.is_sole_proprietor_default IS
'法人以外（個人事業主）の取引先を自動生成するときに使う種別。1 行だけ true';

CREATE UNIQUE INDEX uq_account_types_sole_proprietor_default
  ON account_types ((TRUE)) WHERE is_sole_proprietor_default AND deleted_at IS NULL;

UPDATE account_types SET is_sole_proprietor_default = TRUE WHERE slug = 'sole_proprietor';

-- ------------------------------------------------------------
-- 3. システム必須行を削除・無効化できないようにする
--
-- **マスタ管理は admin が自由に編集できる。** 業務の骨格に関わる行を消されると、
-- リードの保存や取引先の自動生成が止まる（利用者からの懸念）。
-- 「どの行が必須か」は**フラグで表す**（名前やスラッグで判定しない）。
-- ------------------------------------------------------------
ALTER TABLE lead_categories ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lead_stages     ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE account_types   ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE pipeline_types  ADD COLUMN is_system_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN lead_categories.is_system_required IS
'システムが動くのに必要な行。削除できない（画面にも削除ボタンを出さない）';
COMMENT ON COLUMN lead_stages.is_system_required IS     '同上';
COMMENT ON COLUMN account_types.is_system_required IS   '同上';
COMMENT ON COLUMN pipeline_types.is_system_required IS  '同上';

-- **カテゴリは 4 行とも必須。** 判定結果の入れ物なので、消すと
-- リードにカテゴリが付かなくなる（進捗画面が空になる）
UPDATE lead_categories SET is_system_required = TRUE WHERE deleted_at IS NULL;

-- ステージは「規則を持つもの」が必須。requires_deal / requires_contract /
-- is_terminal / 各既定は、消えるとトリガーや自動生成が拠り所を失う
UPDATE lead_stages SET is_system_required = TRUE
 WHERE deleted_at IS NULL
   AND (requires_deal OR requires_contract OR is_terminal
        OR auto_promote_to_deal OR is_inquiry_default OR is_qualification);

-- 取引先種別は自動生成で使うものが必須
UPDATE account_types SET is_system_required = TRUE
 WHERE deleted_at IS NULL
   AND (is_company_default OR is_sole_proprietor_default);

-- パイプラインは商談化の既定が必須
UPDATE pipeline_types SET is_system_required = TRUE
 WHERE deleted_at IS NULL AND is_default;

-- 削除（論理削除）を拒む
CREATE OR REPLACE FUNCTION prevent_system_required_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 論理削除（deleted_at を入れる）も物理削除も止める
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system_required THEN
      RAISE EXCEPTION
        'この行はシステムが使うため削除できません（%）。不要にするには、先に別の行へ役割を移してください',
        OLD.name;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL AND OLD.is_system_required THEN
    RAISE EXCEPTION
      'この行はシステムが使うため削除できません（%）。不要にするには、先に別の行へ役割を移してください',
      OLD.name;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION prevent_system_required_delete IS
'システム必須のマスタ行を削除させない。役割を別の行へ移してからにする';

CREATE TRIGGER trg_lead_categories_protect
  BEFORE UPDATE OR DELETE ON lead_categories
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_lead_stages_protect
  BEFORE UPDATE OR DELETE ON lead_stages
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_account_types_protect
  BEFORE UPDATE OR DELETE ON account_types
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();
CREATE TRIGGER trg_pipeline_types_protect
  BEFORE UPDATE OR DELETE ON pipeline_types
  FOR EACH ROW EXECUTE FUNCTION prevent_system_required_delete();

-- ------------------------------------------------------------
-- 4. 使用中のステータスを消させない
--
-- ステータスはステージに従属し、リードが直接参照する。
-- 消すと既存リードの参照先が失われる（stage は残るのに status だけ消える）。
-- **参照が 1 件でもあれば拒む**（システム必須とは別の観点）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_in_use_status_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM leads WHERE status_id = OLD.id AND deleted_at IS NULL;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'このステータス（%）は % 件のリードが使っています。先にリードのステータスを変更してください',
      OLD.name, v_count;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMENT ON FUNCTION prevent_in_use_status_delete IS
'使用中のリードステータスを消させない。既存リードの参照先が失われるため';

CREATE TRIGGER trg_lead_statuses_in_use
  BEFORE UPDATE OR DELETE ON lead_statuses
  FOR EACH ROW EXECUTE FUNCTION prevent_in_use_status_delete();

-- ------------------------------------------------------------
-- 5. 契約からの取引先自動生成（本体の差し替え）
--
-- 変更したのは種別の引き方だけ。他の処理は元のまま
-- （取引先名の決め方・主担当の紐付け・区分の付与・リードへの記録）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_account_on_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deal       deals%ROWTYPE;
  v_company    companies%ROWTYPE;
  v_contact    contacts%ROWTYPE;
  v_account_id UUID;
  v_type_id    UUID;
  v_status_id  UUID;
  v_role_id    UUID;
  v_name       TEXT;
  v_actor      UUID := COALESCE(auth.uid(), NEW.created_by, NEW.registered_by);
BEGIN
  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_deal FROM deals WHERE id = NEW.deal_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_account_id := v_deal.account_id;

  -- ── 取引先が未作成なら作る ────────────────────────────────────────────────
  IF v_account_id IS NULL THEN
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

    -- **スラッグで引かない。** どの種別を使うかはマスタの設定が持つ
    -- （20260805000020）。法人か個人事業主かで分ける
    IF v_deal.company_id IS NOT NULL THEN
      SELECT id INTO v_type_id FROM account_types
       WHERE is_company_default AND deleted_at IS NULL LIMIT 1;
    ELSE
      SELECT id INTO v_type_id FROM account_types
       WHERE is_sole_proprietor_default AND deleted_at IS NULL LIMIT 1;
    END IF;

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
  END IF;

  -- ── 区分の付与 ────────────────────────────────────────────────────────────
  -- 取引先が既にあった場合もここは通す。
  -- 顧客として登録済みの相手と仕入れ契約を結べば「顧客 + 仕入れ先」になる
  SELECT id INTO v_role_id FROM account_role_types
   WHERE pipeline_type_id = v_deal.pipeline_type_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_role_id IS NOT NULL AND v_account_id IS NOT NULL THEN
    INSERT INTO account_roles (account_id, role_type_id, assigned_by_contract, created_by)
    VALUES (v_account_id, v_role_id, TRUE, v_actor)
    ON CONFLICT (account_id, role_type_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$

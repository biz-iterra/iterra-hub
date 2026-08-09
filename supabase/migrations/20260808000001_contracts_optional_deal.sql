-- ============================================================
-- 契約をディールに紐づかない状態で持てるようにする（T-0065）
--
--   2026-08-07 にディールの編集画面へ「既存の契約を紐づける」を置いたが、
--   `contracts.deal_id` が NOT NULL のため、契約は必ずどれかのディールに属していた。
--   つまり「紐づける」が**必ず他のディールから奪う付け替え**になっていた。
--
--   利用者判断で `deal_id` を任意にし、
--   **紐づけ候補を「どのディールにも紐づいていない契約」だけ**にする。
--   ディールから外す（= NULL に戻す）操作も入る（T-0067）。
--
--   1 ディールに複数の契約が下がる作りは変えない。
-- ============================================================

-- ------------------------------------------------------------
-- 1. deal_id を任意にする
--
--   既存行はすべて deal_id を持っているのでバックフィルは要らない。
-- ------------------------------------------------------------
ALTER TABLE contracts ALTER COLUMN deal_id DROP NOT NULL;

COMMENT ON COLUMN contracts.deal_id IS
'ディール（任意）。どのディールにも紐づかない契約を持てる。ディールの編集画面から紐づけ／解除する';

-- 紐づけ候補は必ずこの条件で引く（未紐づけ かつ 生存）。
-- 全体の索引ではなく部分索引にするのは、紐づけ済みが大半になるため
CREATE INDEX IF NOT EXISTS idx_contracts_unlinked
  ON contracts (created_at DESC)
  WHERE deal_id IS NULL AND deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. 後から紐づけたときにも取引先を作る
--
--   `ensure_account_on_contract()` は AFTER **INSERT** だけに張られていた。
--   契約を作った瞬間しか走らないため、**後からディールへ紐づけても取引先ができない**
--   （src/actions/contracts.ts に「付け替えでは走らない」と注記していた既知の穴）。
--
--   T-0065 で「未紐づけの契約を後からディールへ紐づける」が標準の操作になるので、
--   ここで塞ぐ。関数本体は冒頭に `IF NEW.deal_id IS NULL THEN RETURN NEW;` を
--   持っているため**変更不要**で、紐づけ解除（NULL へ）は無害に素通りする。
--
--   **解除しても取引先は消さない。** 契約があった事実は残るし、
--   取引先には他のディールや連絡先がぶら下がっている可能性がある。
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_contracts_ensure_account ON contracts;
CREATE TRIGGER trg_contracts_ensure_account
  AFTER INSERT OR UPDATE OF deal_id ON contracts
  FOR EACH ROW EXECUTE FUNCTION ensure_account_on_contract();

-- ------------------------------------------------------------
-- 3. 紐づけ解除でもリードのステージ要件を守る
--
--   `check_contract_deletion_against_leads()` は BEFORE UPDATE OF **deleted_at**
--   にしか張られていない。つまり契約を消さずに `deal_id` を NULL にすると
--   **ステージ要件の検査を素通りして**「ステージは取引先なのに契約が無い」
--   状態を作れてしまう。deal_id を動かせるようにする以上、ここも見る。
--
--   判定対象のディールは **OLD.deal_id**（外す前に付いていたディール）。
--   削除の場合は NEW.deal_id = OLD.deal_id なので同じ式で足りる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_contract_detach_against_leads()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_name TEXT;
  v_soft_deleting BOOLEAN;
  v_detaching     BOOLEAN;
BEGIN
  v_soft_deleting := (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL);
  v_detaching     := (NEW.deal_id IS DISTINCT FROM OLD.deal_id);

  -- どちらでもなければ何もしない
  IF NOT v_soft_deleting AND NOT v_detaching THEN
    RETURN NEW;
  END IF;

  -- もともとどのディールにも付いていなければ、リードが参照しようがない
  IF OLD.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- この契約が外れると契約 0 件になるリードだけが対象
  SELECT l.lead_name INTO v_lead_name
    FROM leads l
    JOIN lead_stages s ON s.id = l.stage_id
   WHERE l.promoted_deal_id = OLD.deal_id
     AND l.deleted_at IS NULL
     AND s.requires_contract
     AND NOT EXISTS (
       SELECT 1 FROM contracts c
        WHERE c.deal_id = OLD.deal_id
          AND c.deleted_at IS NULL
          AND c.id <> OLD.id
     )
   LIMIT 1;

  IF v_lead_name IS NOT NULL THEN
    IF v_soft_deleting THEN
      RAISE EXCEPTION
        'この契約はリード「%」が参照している唯一の契約です。先にリードのステージを下げてから削除してください',
        v_lead_name;
    ELSE
      RAISE EXCEPTION
        'この契約はリード「%」が参照している唯一の契約です。先にリードのステージを下げてから紐づけを解除してください',
        v_lead_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION check_contract_detach_against_leads IS
'契約の論理削除・ディールからの紐づけ解除で「ステージは取引先なのに契約が無い」状態を作らせない';

DROP TRIGGER IF EXISTS trg_contract_deletion_against_leads ON contracts;
DROP TRIGGER IF EXISTS trg_contract_detach_against_leads ON contracts;
CREATE TRIGGER trg_contract_detach_against_leads
  BEFORE UPDATE OF deleted_at, deal_id ON contracts
  FOR EACH ROW EXECUTE FUNCTION check_contract_detach_against_leads();

DROP FUNCTION IF EXISTS check_contract_deletion_against_leads();

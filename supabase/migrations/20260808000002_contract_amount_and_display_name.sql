-- ============================================================
-- 契約に金額を持たせ、契約名を自動生成する（T-0068）
--
--   契約名が任意入力のままで命名が揃わなかった。保存のたびに
--   **締結日_契約書名_契約種別_金額_契約ID** を組み立てる。
--
--   **人が入れる `contract_name`（契約書名）は残す。** 生成結果は別列に入れる。
--   上書きにすると、一度保存した時点で人の入力が失われ、
--   その生成名がさらに材料になって二重に連結されていく。
--
--   **金額は contracts に持つ。** `deals.amount` は使わない。
--   1 ディールに複数の契約が下がるため「ディールの金額 = この契約の金額」ではない。
--
-- なぜ DB 側で組み立てるか（CLAUDE.md「値の整形は TS 側」の例外）:
--
--   1. `contract_code` は BEFORE INSERT トリガーでしか確定しない。
--      TS でやると「INSERT → 返ってきたコードで再 UPDATE」の 2 段書き込みになり、
--      途中で失敗すると中途半端な行が残る（まさに規約が禁じている形）。
--      おまけに人の操作でない UPDATE が変更履歴に必ず 1 件積まれる
--   2. 契約種別の名前が別テーブルにあり、TS 側だと
--      **マスタ名を直したときに既存の契約名が追随できない**
--   3. seed・SQL 直接操作・将来の一括取込でも同じ結果になる必要がある
--   4. 生成列（GENERATED ALWAYS AS）は同一行の IMMUTABLE 式しか使えず、
--      `contract_types` を引けないので使えない
--
--   **TS 側に同じ規則を二重実装しない。** 正本はこのファイルの
--   `build_contract_display_name()` だけ（`company-name.ts` と
--   `expand_corporate_abbreviations` で「片方だけ直す」事故を経験している）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 列
-- ------------------------------------------------------------
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amount BIGINT CHECK (amount >= 0);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_display_name TEXT;

COMMENT ON COLUMN contracts.amount IS
'契約金額。deals.amount とは別（1 ディールに複数の契約が下がるため）';

COMMENT ON COLUMN contracts.contract_display_name IS
'契約名（自動生成）。締結日_契約書名_契約種別_金額_契約ID。保存時にトリガーが組み立てる。人は編集しない';

-- 元の COMMENT は「契約名」だったが、自動生成の契約名と紛らわしい。
-- 画面のラベル（契約書名）に合わせる
COMMENT ON COLUMN contracts.contract_name IS
'契約書名（人が入力する文書名）。自動生成の契約名 contract_display_name の材料になる';

-- 一覧の 1 列目・詳細の見出し・横断検索がこの列を引く
CREATE INDEX IF NOT EXISTS idx_contracts_display_name
  ON contracts (contract_display_name);

-- ------------------------------------------------------------
-- 2. 組み立ての規則（正本）
--
--   書式:
--     日付   YYYYMMDD（区切りが _ なので - や / を混ぜない。文字列ソートが日付順になる）
--     金額   桁区切りなしの数字（, は CSV とファイル名で壊れる。¥ や 円 は連結名の中でノイズ）
--
--   **欠けた部品は落として連結する。** 締結日・種別・金額はどれも未設定がありうるので、
--   素直に連結すると `__` が並んで読めなくなる。
--   契約コードは必ず入るので、結果が空文字になることはない。
--
--   部品の中に `_` があると区切りの意味が壊れるため `-` に置き換える。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION build_contract_display_name(
  p_execution_date   DATE,
  p_contract_name    TEXT,
  p_contract_type_id UUID,
  p_amount           BIGINT,
  p_contract_code    TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_type_name TEXT;
  v_parts     TEXT[];
BEGIN
  IF p_contract_type_id IS NOT NULL THEN
    -- 論理削除済みのマスタでも名前は出す（過去の契約名が黙って変わらないように）
    SELECT name INTO v_type_name FROM contract_types WHERE id = p_contract_type_id;
  END IF;

  v_parts := ARRAY[
    CASE WHEN p_execution_date IS NULL THEN NULL
         ELSE to_char(p_execution_date, 'YYYYMMDD') END,
    NULLIF(translate(btrim(COALESCE(p_contract_name, '')), '_', '-'), ''),
    NULLIF(translate(btrim(COALESCE(v_type_name, '')),    '_', '-'), ''),
    CASE WHEN p_amount IS NULL THEN NULL ELSE p_amount::TEXT END,
    NULLIF(translate(btrim(COALESCE(p_contract_code, '')), '_', '-'), '')
  ];

  RETURN NULLIF(array_to_string(array_remove(v_parts, NULL), '_'), '');
END;
$$;

COMMENT ON FUNCTION build_contract_display_name IS
'契約名を組み立てる（締結日_契約書名_契約種別_金額_契約ID）。欠けた部品は落として連結する。この規則の正本';

-- ------------------------------------------------------------
-- 3. 保存時に適用する
--
--   **BEFORE トリガーは名前の昇順に走る。**
--     trg_contracts_generate_code   (g) … contract_code を採番
--     trg_contracts_set_display_name(s) … その code を読んで契約名を組み立てる
--   この並びに依存しているので、**トリガー名を変えないこと**。
--   逆順になると INSERT 時の契約名から契約コードが落ちる。
--
--   `UPDATE OF ...` で列を絞らず**毎回無条件に再計算する**。
--   絞ると「バックフィル漏れの行が永久に直らない」「マスタ名の追随を
--   別経路で書く必要が出る」ため。書き込みの少ないテーブルなのでコストは無視できる。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_contract_display_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.contract_display_name := build_contract_display_name(
    NEW.execution_date,
    NEW.contract_name,
    NEW.contract_type_id,
    NEW.amount,
    NEW.contract_code
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_contract_display_name IS
'契約名を毎回組み立て直す。trg_contracts_generate_code より後に走る必要がある（トリガー名の昇順に依存）';

DROP TRIGGER IF EXISTS trg_contracts_set_display_name ON contracts;
CREATE TRIGGER trg_contracts_set_display_name
  BEFORE INSERT OR UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_contract_display_name();

-- ------------------------------------------------------------
-- 4. 契約種別マスタの名前が変わったら追随する
--
--   契約名に種別名を焼き込んでいるため、マスタを直したときに
--   既存の契約名が古いままになる。空更新で BEFORE トリガーに再計算させる。
--
--   変更履歴は増えない（contract_display_name は次のマイグレーションで
--   差分の対象から外す。それだけが変わる UPDATE は記録されなくなる）。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_contract_display_names(p_contract_type_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE contracts
     SET contract_display_name = NULL   -- BEFORE トリガーが組み立て直す
   WHERE p_contract_type_id IS NULL
      OR contract_type_id = p_contract_type_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION refresh_contract_display_names IS
'契約名を組み立て直す。引数なしで全件。契約種別マスタの改名時と、規則を変えたときの復旧に使う';

CREATE OR REPLACE FUNCTION refresh_contract_names_on_type_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM refresh_contract_display_names(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_types_refresh_contract_names ON contract_types;
CREATE TRIGGER trg_contract_types_refresh_contract_names
  AFTER UPDATE OF name ON contract_types
  FOR EACH ROW
  WHEN (NEW.name IS DISTINCT FROM OLD.name)
  EXECUTE FUNCTION refresh_contract_names_on_type_rename();

-- 既存行のバックフィルは次のマイグレーションで行う。
-- **先に変更履歴の除外を入れないと、全契約分の差分が積まれるため**

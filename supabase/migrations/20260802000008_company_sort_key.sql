-- ============================================================
-- 事業者情報の並び順を「法人格を除いた名称」にする
--
-- これまで一覧は登録の新しい順だった。件数が 3,598 件あり、
-- 目当ての事業者を探すには名前順の方が辿りやすい。
--
-- ただし「株式会社ABC」と「ABC株式会社」が離れた位置に並ぶと探せない。
-- 法人格は並びに意味を持たないので、落としてから比べる。
--
-- **漢字の読み順にはならない。** 読み仮名を持たない漢字は
-- どの照合順序でも五十音順に並べられない（ICU の ja でも同じ）。
-- `name_kana` があればそれを使うので、フリガナを入れた事業者から
-- 読みの順に並ぶようになる。
-- ============================================================

CREATE OR REPLACE FUNCTION company_sort_key(p_name TEXT, p_name_kana TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        -- フリガナがあれば読みの順に並ぶのでそちらを優先する
        COALESCE(
          NULLIF(btrim(COALESCE(p_name_kana, '')), ''),
          expand_corporate_abbreviations(COALESCE(p_name, ''))
        ),
        -- 法人格は前株・後株のどちらでも同じ位置に並ぶよう落とす。
        -- フリガナ側のカナ表記も対象にする
        '(株式会社|有限会社|合同会社|合資会社|合名会社'
        || '|一般社団法人|一般財団法人|公益社団法人|公益財団法人'
        || '|特定非営利活動法人|NPO法人|医療法人|社会福祉法人|学校法人|宗教法人'
        || '|協同組合|弁護士法人|税理士法人|司法書士法人|行政書士法人'
        || '|社会保険労務士法人|弁理士法人|監査法人'
        || '|カブシキガイシャ|カブシキカイシャ|ユウゲンガイシャ|ユウゲンカイシャ'
        || '|ゴウドウガイシャ|ゴウドウカイシャ'
        || '|イッパンシャダンホウジン|イッパンザイダンホウジン'
        || '|コウエキシャダンホウジン|コウエキザイダンホウジン)',
        '', 'g'
      )
    ),
    ''
  );
$$;

COMMENT ON FUNCTION company_sort_key(TEXT, TEXT) IS
  '事業者の並び順キー。フリガナ優先、無ければ名称から法人格を落としたもの';

-- ------------------------------------------------------------
-- 並び順キーを列として持つ
--
-- supabase-js の order() は列しか指定できないため、式のままでは並べられない。
-- 生成列にすれば保存時に自動で追従する。
--
-- COLLATE に ICU の ja-JP を指定する。既定の en_US では記号・かなの
-- 扱いが日本語の並びとずれる。
--
-- **company_sort_key を変えたらこの列を作り直すこと。**
-- 生成列は関数の再定義では再計算されない（既存行は古い値のまま残る）。
--   ALTER TABLE companies DROP COLUMN sort_key, ADD COLUMN sort_key ... ;
-- ------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN sort_key TEXT COLLATE "ja-JP-x-icu"
    GENERATED ALWAYS AS (company_sort_key(name, name_kana)) STORED;

COMMENT ON COLUMN companies.sort_key IS
  '一覧の並び順。法人格を除いた名称（フリガナがあればそちら）。生成列';

CREATE INDEX companies_sort_key_idx ON companies (sort_key) WHERE deleted_at IS NULL;

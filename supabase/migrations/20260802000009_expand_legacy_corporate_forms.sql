-- ============================================================
-- 旧制度の法人格と括弧付き略記に対応し、並び順から取りこぼしを無くす
--
-- 20260802000008 で並び順を「法人格を除いた名称」にしたが、実データには
-- 開けていない表記が残っていた。
--
--   (一般㈶)秋田県建設･工業技術センター   … 3 件
--   ㈶やまがた産業支援機構                 … 2 件
--   （財）災害科学研究所                   … 7 件
--   （社）小石川医師会                     … 2 件
--
-- これらが法人格として落ちないため、一覧の先頭に固まっていた。
--
-- `㈶` `㈳` は旧制度の「財団法人」「社団法人」。一般/公益へ移行する前の
-- 名称がそのまま残っている事業者があるので、そのまま開いてマスタにも持つ。
-- 20260802000003 では「綴りが一意に定まらない」として見送ったが、
-- 一般/公益の区別は「(一般㈶)」のように接頭辞で書かれており、
-- 単独の `㈶` は旧制度の財団法人を指すと読める。
-- ============================================================

-- ------------------------------------------------------------
-- 略記の展開に旧制度と括弧付きを足す
--
-- **上から順に当てるので、複合した略記を単独より先に置く。**
-- 「㈶」を先に開くと「(一般㈶)」が「(一般財団法人)」になってしまう。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION expand_corporate_abbreviations(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name  TEXT;
  v_rule  TEXT[];
  v_rules TEXT[] := ARRAY[
    ARRAY['㈱|\(株\)|（株）',       '株式会社'],
    ARRAY['㈲|\(有\)|（有）',       '有限会社'],
    ARRAY['\(同\)|（同）',          '合同会社'],
    ARRAY['㈾|\(資\)|（資）',       '合資会社'],
    ARRAY['㈴|\(名\)|（名）',       '合名会社'],
    ARRAY['[（(]一般㈶[)）]',       '一般財団法人'],
    ARRAY['[（(]公益㈶[)）]',       '公益財団法人'],
    ARRAY['[（(]一般㈳[)）]',       '一般社団法人'],
    ARRAY['[（(]公益㈳[)）]',       '公益社団法人'],
    ARRAY['\(一社\)|（一社）',      '一般社団法人'],
    ARRAY['\(一財\)|（一財）',      '一般財団法人'],
    ARRAY['\(公社\)|（公社）',      '公益社団法人'],
    ARRAY['\(公財\)|（公財）',      '公益財団法人'],
    ARRAY['\(特非\)|（特非）',      '特定非営利活動法人'],
    ARRAY['\(医\)|（医）',          '医療法人'],
    ARRAY['㈻|\(学\)|（学）',       '学校法人'],
    ARRAY['\(福\)|（福）',          '社会福祉法人'],
    ARRAY['\(宗\)|（宗）',          '宗教法人'],
    ARRAY['㈶|\(財\)|（財）',       '財団法人'],
    ARRAY['㈳|\(社\)|（社）',       '社団法人']
  ];
BEGIN
  IF p_name IS NULL THEN
    RETURN NULL;
  END IF;

  v_name := replace(p_name, '　', ' ');

  FOREACH v_rule SLICE 1 IN ARRAY v_rules LOOP
    v_name := regexp_replace(v_name, v_rule[1], v_rule[2], 'g');
  END LOOP;

  -- NOT NULL の列に入るので空文字は NULL にしない
  RETURN btrim(regexp_replace(v_name, '[[:space:]]+', ' ', 'g'));
END;
$$;

-- 旧制度の法人格も台帳に持つ。移行前の名称のままの事業者がいる
INSERT INTO corporate_types (name) VALUES
  ('財団法人'),
  ('社団法人')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------
-- 並び順キー
--
-- 20260802000008 からの変更点:
--   - 旧制度の法人格（財団法人 / 社団法人）も落とす
--   - 先頭に残った記号を落とす。「「あしたのいえ」秋田…」のような名称が
--     記号のせいで一覧の先頭に固まっていた
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION company_sort_key(p_name TEXT, p_name_kana TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
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
          || '|社会保険労務士法人|弁理士法人|監査法人|財団法人|社団法人'
          || '|カブシキガイシャ|カブシキカイシャ|ユウゲンガイシャ|ユウゲンカイシャ'
          || '|ゴウドウガイシャ|ゴウドウカイシャ'
          || '|イッパンシャダンホウジン|イッパンザイダンホウジン'
          || '|コウエキシャダンホウジン|コウエキザイダンホウジン)',
          '', 'g'
        ),
        -- 法人格を落とした後に残る括弧などを頭から取り除く。
        -- 記号は文字より前に並ぶため、残すと一覧の先頭に集まってしまう
        '^[^[:alnum:]]+', ''
      )
    ),
    ''
  );
$$;

-- ============================================================
-- 既存データへの反映
-- ============================================================

-- 展開できる表記が増えたので名称を是正する
UPDATE companies
   SET name = expand_corporate_abbreviations(name)
 WHERE name IS DISTINCT FROM expand_corporate_abbreviations(name);

-- 旧制度の法人格が付くようになった分を埋める。人が選んだ値は上書きしない
UPDATE companies
   SET corporate_type_id = resolve_corporate_type_id(name)
 WHERE corporate_type_id IS NULL
   AND resolve_corporate_type_id(name) IS NOT NULL;

-- ------------------------------------------------------------
-- 生成列と式インデックスの作り直し
--
-- どちらも関数の再定義では追従しない。
-- 生成列は保存時にしか計算されず、式インデックスは積んだ値をそのまま持つ。
-- ------------------------------------------------------------
ALTER TABLE companies DROP COLUMN sort_key;

ALTER TABLE companies
  ADD COLUMN sort_key TEXT COLLATE "ja-JP-x-icu"
    GENERATED ALWAYS AS (company_sort_key(name, name_kana)) STORED;

COMMENT ON COLUMN companies.sort_key IS
  '一覧の並び順。法人格を除いた名称（フリガナがあればそちら）。生成列';

CREATE INDEX companies_sort_key_idx ON companies (sort_key) WHERE deleted_at IS NULL;

REINDEX INDEX companies_normalized_name_idx;

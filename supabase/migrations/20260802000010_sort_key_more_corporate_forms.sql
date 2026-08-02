-- ============================================================
-- 並び順キーの法人格を足す
--
-- フリガナを法人格抜きで作るようにしたところ（src/lib/company-name.ts）、
-- 落とせていない法人格が実データに残っていた。
--
--   独立行政法人中小企業基盤整備機構沖縄事務所
--   地方独立行政法人 鳥取県産業技術センター
--   国立研究開発法人量子科学技術研究開発機構
--   ＮＰＯ法人 埼玉ＩＴコーディネータ        … 全角表記
--
-- フリガナが無い事業者は名称から並び順キーを作るので、こちらにも同じ
-- 法人格が要る。**「地方独立行政法人」を「独立行政法人」より先に置くこと。**
-- 逆だと「地方」だけが残る。
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
          || '|特定非営利活動法人|NPO法人|ＮＰＯ法人'
          || '|地方独立行政法人|独立行政法人|国立研究開発法人'
          || '|医療法人|社会福祉法人|学校法人|宗教法人'
          || '|協同組合|弁護士法人|税理士法人|司法書士法人|行政書士法人'
          || '|社会保険労務士法人|弁理士法人|監査法人|財団法人|社団法人'
          || '|カブシキガイシャ|カブシキカイシャ|ユウゲンガイシャ|ユウゲンカイシャ'
          || '|ゴウドウガイシャ|ゴウドウカイシャ'
          || '|イッパンシャダンホウジン|イッパンザイダンホウジン'
          || '|コウエキシャダンホウジン|コウエキザイダンホウジン)',
          '', 'g'
        ),
        -- 「◯◯センター（地方独立行政法人）」のように括弧の中身が法人格だけだと
        -- 空の括弧が残る
        '[（(][[:space:]]*[)）]', '', 'g'
      ),
      -- 法人格を落とした後に残る括弧などを頭から取り除く。
      -- 記号は文字より前に並ぶため、残すと一覧の先頭に集まってしまう
      '^[^[:alnum:]]+', ''
      )
    ),
    ''
  );
$$;

-- 括弧の中身が法人格だけだったフリガナに空の括弧が残っている。
-- 生成し直しでは拾えない（法人格の語が消えているため）ので直接直す
UPDATE companies
   SET name_kana = NULLIF(btrim(regexp_replace(name_kana, '[（(][[:space:]]*[)）]', '', 'g')), '')
 WHERE name_kana ~ '[（(][[:space:]]*[)）]';

-- 生成列は関数の再定義では再計算されないので作り直す
ALTER TABLE companies DROP COLUMN sort_key;

ALTER TABLE companies
  ADD COLUMN sort_key TEXT COLLATE "ja-JP-x-icu"
    GENERATED ALWAYS AS (company_sort_key(name, name_kana)) STORED;

COMMENT ON COLUMN companies.sort_key IS
  '一覧の並び順。法人格を除いた名称（フリガナがあればそちら）。生成列';

CREATE INDEX companies_sort_key_idx ON companies (sort_key) WHERE deleted_at IS NULL;

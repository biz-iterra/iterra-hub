-- ============================================================
-- 事業者名・会社名・屋号名を分けて持ち、「法人格」を「事業種別」と呼ぶ
--
-- 背景（2026-08-04 の指示）:
--   「会社名」と「屋号名」で呼び方が揺れていた。法人は事業者名＝会社名だが、
--   個人事業主は屋号だったり個人名だったりする。
--
-- 決めたこと:
--   - `name` は **事業者名**（表示・検索・名寄せの正本）。従来どおり必須
--   - `corporate_name`（会社名）と `trade_name`（屋号名）を別に持つ
--   - 法人は 事業者名 ＝ 会社名。個人事業主は 事業者名 ＝ 屋号名 or 個人名
--   - 画面の「法人格」は **「事業種別」** と呼ぶ（個人事業主も含むため）
--
-- **名寄せ・検索は `name` のまま。** 会社名と屋号名は補助であり、
-- ここを変えると resolve_or_create_company や検索の挙動が変わってしまう。
-- ============================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS corporate_name TEXT,
  ADD COLUMN IF NOT EXISTS trade_name     TEXT;

COMMENT ON COLUMN companies.name IS
'事業者名。表示・検索・名寄せの正本。法人は会社名、個人事業主は屋号か個人名が入る';
COMMENT ON COLUMN companies.corporate_name IS
'会社名（法人のとき）。事業者名と同じ値になるのが普通だが、正式名称を別に持ちたい場合に使う';
COMMENT ON COLUMN companies.trade_name IS
'屋号名（個人事業主のとき）。屋号を持たない事業主では空になる';

-- 既存データの埋め戻し。
-- 個人事業主かどうかで入れ先を分ける（名称はマスタの値で判定する）
UPDATE companies c
   SET corporate_name = c.name
  FROM corporate_types ct
 WHERE ct.id = c.corporate_type_id
   AND ct.name <> '個人事業主'
   AND c.corporate_name IS NULL;

UPDATE companies c
   SET trade_name = c.name
  FROM corporate_types ct
 WHERE ct.id = c.corporate_type_id
   AND ct.name = '個人事業主'
   AND c.trade_name IS NULL;

-- 事業種別が未設定のものは会社名として扱う（法人の方が多いため）
UPDATE companies
   SET corporate_name = name
 WHERE corporate_type_id IS NULL AND corporate_name IS NULL;

CREATE INDEX IF NOT EXISTS companies_trade_name_idx
  ON companies(trade_name) WHERE trade_name IS NOT NULL;

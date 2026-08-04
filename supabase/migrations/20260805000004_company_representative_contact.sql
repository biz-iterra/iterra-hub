-- ============================================================
-- 代表者を連絡先（法人代表）から選べるようにする
--
-- 背景（2026-08-04 の依頼）:
--   `companies.representative_name` は自由入力の TEXT だった。
--   同じ人が連絡先にも登録されているのに繋がっておらず、改名や異動があっても
--   追従しないうえ、代表者の連絡手段へ辿れない。
--
-- 方針:
--   - `representative_contact_id` を足して**連絡先を指す**（正はこちら）
--   - `representative_name` は**残す**。新規作成の時点ではその会社に紐づく
--     連絡先がまだ無いことが普通で、自由入力の逃げ道が要る
--   - 表示は「連絡先があればその氏名、無ければ representative_name」
--
-- 個人事業主には代表者の概念を別に持たせない（本人しかいないため）。
-- 画面側で欄ごと出さない（src/lib/company-type.ts）。
-- ============================================================

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS representative_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;

COMMENT ON COLUMN companies.representative_contact_id IS
'代表者の連絡先。これがあれば氏名はこちらから引く（representative_name は連絡先が無いときの自由入力）';
COMMENT ON COLUMN companies.representative_name IS
'代表者名の自由入力。representative_contact_id があるときはそちらが正';

-- 参照する場面は「この会社の代表者は誰か」なので company 側から引く。
-- 逆引き（この連絡先が代表になっている会社）は稀なので索引は片方だけ
CREATE INDEX IF NOT EXISTS companies_representative_contact_idx
  ON companies(representative_contact_id) WHERE representative_contact_id IS NOT NULL;

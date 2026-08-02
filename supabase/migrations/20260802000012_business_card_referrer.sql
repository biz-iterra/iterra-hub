-- ============================================================
-- 名刺に紹介者を記録する
--
-- 誰の紹介で会えたのかは追客の判断に効くが、置き場所が無かった。
-- **名刺ごとに持つ。** 同じ人でも、転職後に別の人から改めて紹介される
-- ことがある。連絡先に 1 つだけ持たせると、どの出会いの紹介者なのかが
-- 分からなくなる。
--
-- 紹介者は連絡先から選ぶ。ただし社外の人づて・イベント経由など
-- 連絡先として登録されていない相手もいるので、**自由記入も併せて持つ**。
-- どちらか片方だけでも記録できる。
-- ============================================================

ALTER TABLE business_cards
  ADD COLUMN referrer_contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN referral_memo       TEXT;

COMMENT ON COLUMN business_cards.referrer_contact_id IS
  '紹介者の連絡先。連絡先として登録されていない紹介者は referral_memo に書く';
COMMENT ON COLUMN business_cards.referral_memo IS
  '紹介の経緯。連絡先に無い紹介者の名前や、紹介の状況を自由に記録する';

-- 「この人が誰を紹介したか」を引けるようにする
CREATE INDEX idx_business_cards_referrer
  ON business_cards (referrer_contact_id)
  WHERE referrer_contact_id IS NOT NULL;

-- 自分自身を紹介者にはできない
ALTER TABLE business_cards
  ADD CONSTRAINT chk_business_cards_referrer_not_self
  CHECK (referrer_contact_id IS NULL OR referrer_contact_id <> contact_id);

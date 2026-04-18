-- ============================================================
-- T04: contacts に blood_type を追加
-- 値: 'A' / 'B' / 'AB' / 'O' いずれか。未登録は NULL。
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN blood_type TEXT
    CHECK (blood_type IN ('A', 'B', 'AB', 'O'));

COMMENT ON COLUMN contacts.blood_type IS '血液型（A/B/AB/O）。未登録は NULL。';

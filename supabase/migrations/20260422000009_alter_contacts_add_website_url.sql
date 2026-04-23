-- ============================================================
-- contacts テーブル: website_url カラム追加
-- Phase 9b: Lead 個人昇格時に leads.url から転記するための列
-- ============================================================

ALTER TABLE contacts ADD COLUMN website_url TEXT;

ALTER TABLE contacts
  ADD CONSTRAINT chk_contacts_website_url_length
    CHECK (website_url IS NULL OR char_length(website_url) <= 500);

COMMENT ON COLUMN contacts.website_url IS '個人サイト URL。Lead 個人昇格時に leads.url から転記される';

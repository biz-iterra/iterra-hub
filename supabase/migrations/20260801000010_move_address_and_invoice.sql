-- ============================================================
-- 住所カラムの撤去と、インボイス登録番号の移設
--
-- 住所: contacts / companies が持っていた 5 カラムと other_addresses を廃止し、
--       entity_addresses に一本化する（いずれも実データ 0 件）。
--
-- インボイス: 登録番号は取引の主体に紐づく情報であり、個人（連絡先）の属性ではない。
--             accounts に新設し、contacts からは外す。
--             法人情報（companies）の登録番号はそのまま残す（法人としての番号）。
-- ============================================================

-- ── 取引先にインボイス登録番号を持たせる ──
ALTER TABLE accounts
  ADD COLUMN invoice_registered          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN invoice_registration_number VARCHAR(14) UNIQUE;

ALTER TABLE accounts
  ADD CONSTRAINT chk_accounts_invoice
    CHECK (invoice_registered = FALSE OR invoice_registration_number IS NOT NULL);

COMMENT ON COLUMN accounts.invoice_registration_number IS
  '適格請求書発行事業者の登録番号（T + 13 桁）。法人の取引先は companies にも同じ番号が入りうる';

-- ── 連絡先からインボイスを外す ──
-- 実データ 0 件。個人の属性ではないため持たない
ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS chk_contacts_invoice;

ALTER TABLE contacts
  DROP COLUMN invoice_registered,
  DROP COLUMN invoice_registration_number;

-- ── 住所カラムの撤去 ──
-- entity_addresses へ移行済み（移行対象のデータは無い）
ALTER TABLE contacts
  DROP COLUMN postal_code,
  DROP COLUMN prefecture,
  DROP COLUMN city,
  DROP COLUMN address_line1,
  DROP COLUMN address_line2;

ALTER TABLE companies
  DROP COLUMN postal_code,
  DROP COLUMN prefecture,
  DROP COLUMN city,
  DROP COLUMN address_line1,
  DROP COLUMN address_line2;

-- ── 追加住所テーブルの廃止 ──
-- entity_addresses が同じ役割（label で本社/支店/請求先を区別）を担う
DROP TABLE IF EXISTS other_addresses;

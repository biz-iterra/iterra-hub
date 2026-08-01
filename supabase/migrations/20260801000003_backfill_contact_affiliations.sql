-- ============================================================
-- 既存の連絡先から現在の所属を作る（初期投入）
--
-- contacts が持っている会社・部署・役職を is_current = true の 1 行に写す。
-- これ以降、所属の正本は contact_affiliations になる。
-- 設計: docs/contact-identity.md § 10
-- ============================================================

-- 在籍を確認できた最古の日を推定する。
--   1. その連絡先に紐づくリードの活動記録の最古の日（名刺交換日を含む）
--   2. 無ければ連絡先の作成日
-- 「その日に接点があった＝在籍していた」という事実に基づく。
INSERT INTO contact_affiliations (
  contact_id, company_id, department, job_title,
  started_on, is_current, source, created_by, last_updated_by
)
SELECT
  c.id,
  c.company_id,
  c.department,
  c.job_title,
  COALESCE(
    (
      SELECT MIN(la.called_on)
        FROM leads l
        JOIN lead_activities la ON la.lead_id = l.id
       WHERE l.contact_id = c.id
    ),
    c.created_at::DATE
  ),
  TRUE,
  'import',
  c.created_by,
  c.last_updated_by
  FROM contacts c
 WHERE c.company_id IS NOT NULL
   AND c.deleted_at IS NULL
   -- 二重投入の防止（再実行しても増えない）
   AND NOT EXISTS (
     SELECT 1 FROM contact_affiliations a WHERE a.contact_id = c.id
   );

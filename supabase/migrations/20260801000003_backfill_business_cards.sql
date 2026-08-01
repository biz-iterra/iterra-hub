-- ============================================================
-- 既存データから名刺を作る（初期投入）
--
-- 1. 名刺取込で作られたリードからは、外部キー付きで名刺を復元する。
--    キーを引き継ぐので、同じ CSV を再取込しても名刺は増えない。
-- 2. リード由来でない連絡先は、現在の所属から名刺を 1 枚作る。
-- 3. 連絡先の現在の所属と一致する名刺に「採用済み」の印を付ける。
--
-- source_registered_on には、その情報を得た日として分かる範囲の値を入れる。
-- **在籍期間ではない**ため、順序の根拠には使わない。
-- ============================================================

-- ── 1. 名刺取込のリードから復元 ──
INSERT INTO business_cards (
  contact_id, contact_email_id, contact_phone_id,
  company_id, company_name_raw, department, job_title, address_id,
  source, source_external_key, source_registered_on,
  created_by, last_updated_by
)
SELECT
  l.contact_id,
  ce.id,
  cp.id,
  l.company_id,
  l.company_name,
  l.contact_department,
  l.contact_job_title,
  l.address_id,
  'eight',
  l.source_external_key,
  -- 取込時に活動として記録した日（＝ Eight への登録日）
  (SELECT MIN(la.called_on) FROM lead_activities la WHERE la.lead_id = l.id),
  l.created_by,
  l.last_updated_by
  FROM leads l
  LEFT JOIN contact_emails ce
         ON ce.contact_id = l.contact_id
        AND lower(ce.email) = lower(l.contact_email)
  LEFT JOIN contact_phones cp
         ON cp.contact_id = l.contact_id
        AND cp.phone = l.contact_phone
 WHERE l.contact_id IS NOT NULL
   AND l.deleted_at IS NULL
   AND l.source_external_key IS NOT NULL
   AND (l.company_id IS NOT NULL OR NULLIF(btrim(COALESCE(l.company_name, '')), '') IS NOT NULL)
   AND NOT EXISTS (
     SELECT 1 FROM business_cards b
      WHERE b.source = 'eight' AND b.source_external_key = l.source_external_key
   );

-- ── 2. リード由来でない連絡先 ──
INSERT INTO business_cards (
  contact_id, contact_email_id, contact_phone_id,
  company_id, department, job_title,
  source, source_registered_on, created_by, last_updated_by
)
SELECT
  c.id,
  (SELECT e.id FROM contact_emails e WHERE e.contact_id = c.id
    ORDER BY e.is_primary DESC, e.created_at LIMIT 1),
  (SELECT p.id FROM contact_phones p WHERE p.contact_id = c.id
    ORDER BY p.is_primary DESC, p.created_at LIMIT 1),
  c.company_id,
  c.department,
  c.job_title,
  'import',
  c.created_at::DATE,
  c.created_by,
  c.last_updated_by
  FROM contacts c
 WHERE c.company_id IS NOT NULL
   AND c.deleted_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM business_cards b WHERE b.contact_id = c.id);

-- ── 3. 現在の所属と一致する名刺に採用済みの印を付ける ──
-- 一致するものが複数あれば、最初に作られた 1 枚だけ
UPDATE business_cards b SET is_primary = TRUE
 WHERE b.id IN (
   SELECT DISTINCT ON (b2.contact_id) b2.id
     FROM business_cards b2
     JOIN contacts c ON c.id = b2.contact_id
    WHERE c.company_id IS NOT NULL
      AND b2.company_id = c.company_id
      AND c.deleted_at IS NULL
    ORDER BY b2.contact_id, b2.created_at
 );

-- ── 4. 既存の活動記録の文言を実態に合わせる ──
-- Eight の日付は「名刺を交換した日」ではなく「Eight にデータを登録した日」。
-- 記録として誤読されないよう言い換える
UPDATE lead_activities
   SET note = '名刺データの登録（Eight）'
 WHERE note = '名刺交換（Eight からの取込）';

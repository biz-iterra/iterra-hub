-- ============================================================
-- freee との相互同期（差分を見てから人が確定する）
--
-- 背景（2026-08-04 の依頼）:
--   これまで freee は読み取り専用だった（§23.2）。会計は確定した数字を扱うため、
--   CRM の編集が自動で伝播すると仕訳の前提が崩れる、という判断による。
--
-- 変更した方針（利用者判断）:
--   **CRM を正とする。ただし自動では書かない。**
--   紐付け済みの相手について項目ごとに差分を出し、
--   「CRM の値を freee へ」「freee の値を CRM へ」「触らない」を人が選んでから書く。
--   既定は CRM 側（正だから）だが、会計側の修正を採る余地を残す。
--
-- ここで持つのは「差分の検出」と「書いた記録」だけ。
-- freee への送信はアプリ（src/lib/freee/）が行う。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 同期の記録
--
-- 会計データへの書き込みなので、誰がいつ何をどちらへ書いたかを必ず残す。
-- 失敗も残す（送ったが弾かれた、を後から追えるように）。
-- ------------------------------------------------------------
CREATE TABLE freee_sync_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freee_partner_id  UUID NOT NULL REFERENCES freee_partners(id) ON DELETE CASCADE,
  -- to_freee: CRM → freee / to_crm: freee → CRM
  direction         TEXT NOT NULL CHECK (direction IN ('to_freee', 'to_crm')),
  -- 何を書いたか。{"name": {"from": "旧", "to": "新"}, ...}
  changes           JSONB NOT NULL,
  succeeded         BOOLEAN NOT NULL,
  error_message     TEXT,
  performed_by      UUID REFERENCES crm_users(id),
  performed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX freee_sync_logs_partner_idx
  ON freee_sync_logs(freee_partner_id, performed_at DESC);

COMMENT ON TABLE freee_sync_logs IS
'freee との相互同期の記録。会計データへ書くため、成功・失敗とも残す';

ALTER TABLE freee_sync_logs ENABLE ROW LEVEL SECURITY;

-- 突合と同じく admin の業務。書き込みは service_role（RLS をバイパス）
CREATE POLICY freee_sync_logs_select ON freee_sync_logs
  FOR SELECT TO authenticated USING ((SELECT is_admin()));

-- ------------------------------------------------------------
-- 2. 差分の検出
--
-- 保存せずその場で計算する（freee 側・CRM 側どちらの変化でも陳腐化するため。
-- detect_freee_partner_candidates と同じ考え方）。
--
-- 比較するのは**両方が持っている項目**だけ。CRM にしか無いもの
-- （社内メモ・担当者など）は同期の対象にしない。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_freee_partner_diffs(p_freee_company_id BIGINT)
RETURNS TABLE (
  partner_id    UUID,
  company_id    UUID,
  partner_name  TEXT,
  company_name  TEXT,
  -- [{"field":"name","label":"名称","crm":"...","freee":"..."}, ...]
  diffs         JSONB
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH linked AS (
    SELECT fp.id   AS partner_id,
           fp.name AS partner_name,
           fp.long_name,
           fp.name_kana,
           fp.phone,
           fp.invoice_registration_number,
           fp.address_zipcode,
           fp.address_street_name1,
           c.id    AS company_id,
           c.name  AS company_name,
           c.name_kana AS company_name_kana,
           c.phone AS company_phone,
           c.invoice_registration_number AS company_invoice,
           addr.postal_code   AS company_zipcode,
           addr.address_line1 AS company_street
      FROM freee_partners fp
      JOIN companies c ON c.id = fp.company_id AND c.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT a.postal_code, a.address_line1
          FROM entity_addresses ea
          JOIN addresses a ON a.id = ea.address_id
         WHERE ea.company_id = c.id
         ORDER BY ea.is_primary DESC
         LIMIT 1
      ) addr ON TRUE
     WHERE fp.freee_company_id = p_freee_company_id
       AND fp.link_status IN ('auto', 'confirmed')
       AND fp.freee_deleted_at IS NULL
  ),
  compared AS (
    SELECT l.partner_id,
           l.company_id,
           l.partner_name,
           l.company_name,
           -- 空文字と NULL は同じ「未入力」として扱う。片方だけ空でも差分にしない
           (
             SELECT jsonb_agg(d)
               FROM (
                 SELECT jsonb_build_object(
                          'field', 'name', 'label', '名称',
                          'crm', l.company_name, 'freee', COALESCE(l.long_name, l.partner_name)
                        ) AS d
                  WHERE NULLIF(btrim(l.company_name), '')
                        IS DISTINCT FROM NULLIF(btrim(COALESCE(l.long_name, l.partner_name)), '')
                 UNION ALL
                 SELECT jsonb_build_object(
                          'field', 'name_kana', 'label', 'カナ',
                          'crm', l.company_name_kana, 'freee', l.name_kana
                        )
                  WHERE NULLIF(btrim(COALESCE(l.company_name_kana, '')), '')
                        IS DISTINCT FROM NULLIF(btrim(COALESCE(l.name_kana, '')), '')
                 UNION ALL
                 SELECT jsonb_build_object(
                          'field', 'phone', 'label', '電話番号',
                          'crm', l.company_phone, 'freee', l.phone
                        )
                  WHERE NULLIF(regexp_replace(COALESCE(l.company_phone, ''), '[^0-9]', '', 'g'), '')
                        IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), '')
                 UNION ALL
                 SELECT jsonb_build_object(
                          'field', 'invoice_registration_number', 'label', 'インボイス番号',
                          'crm', l.company_invoice, 'freee', l.invoice_registration_number
                        )
                  WHERE NULLIF(btrim(COALESCE(l.company_invoice, '')), '')
                        IS DISTINCT FROM NULLIF(btrim(COALESCE(l.invoice_registration_number, '')), '')
                 UNION ALL
                 SELECT jsonb_build_object(
                          'field', 'zipcode', 'label', '郵便番号',
                          'crm', l.company_zipcode, 'freee', l.address_zipcode
                        )
                  WHERE NULLIF(regexp_replace(COALESCE(l.company_zipcode, ''), '[^0-9]', '', 'g'), '')
                        IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(l.address_zipcode, ''), '[^0-9]', '', 'g'), '')
                 UNION ALL
                 SELECT jsonb_build_object(
                          'field', 'street', 'label', '住所',
                          'crm', l.company_street, 'freee', l.address_street_name1
                        )
                  WHERE NULLIF(btrim(COALESCE(l.company_street, '')), '')
                        IS DISTINCT FROM NULLIF(btrim(COALESCE(l.address_street_name1, '')), '')
               ) x
           ) AS diffs
      FROM linked l
  )
  SELECT c.partner_id, c.company_id, c.partner_name, c.company_name, c.diffs
    FROM compared c
   WHERE c.diffs IS NOT NULL
   ORDER BY c.company_name;
END;
$$;

COMMENT ON FUNCTION detect_freee_partner_diffs IS
'紐付け済みの相手について CRM と freee の差分を項目ごとに返す。保存せず都度計算する';

REVOKE ALL ON FUNCTION detect_freee_partner_diffs(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_partner_diffs(BIGINT) TO authenticated;

-- ------------------------------------------------------------
-- 3. freee 側の値を CRM へ取り込む（人が選んだ項目だけ）
--
-- CRM 側の更新なので DB 関数で行う。freee への送信はアプリが担う。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_freee_values_to_crm(
  p_partner_id UUID,
  -- 採用する項目名の配列。例: ARRAY['name','phone']
  p_fields     TEXT[],
  p_actor      UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp        freee_partners%ROWTYPE;
  v_actor   UUID := COALESCE(auth.uid(), p_actor);
  v_changes JSONB := '{}'::JSONB;
  v_company companies%ROWTYPE;
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION 'freee との同期は admin だけが行えます';
  END IF;

  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'freee 取引先が見つかりません';
  END IF;
  IF fp.company_id IS NULL THEN
    RAISE EXCEPTION '事業者情報に紐付いていません';
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = fp.company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION '紐付いている事業者情報が見つかりません';
  END IF;

  IF 'name' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('name',
      jsonb_build_object('from', v_company.name, 'to', COALESCE(fp.long_name, fp.name)));
    UPDATE companies SET name = expand_corporate_abbreviations(COALESCE(fp.long_name, fp.name)),
                         last_updated_by = v_actor
     WHERE id = fp.company_id;
  END IF;

  IF 'name_kana' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('name_kana',
      jsonb_build_object('from', v_company.name_kana, 'to', fp.name_kana));
    UPDATE companies SET name_kana = fp.name_kana, last_updated_by = v_actor
     WHERE id = fp.company_id;
  END IF;

  IF 'phone' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('phone',
      jsonb_build_object('from', v_company.phone, 'to', fp.phone));
    UPDATE companies SET phone = fp.phone, last_updated_by = v_actor
     WHERE id = fp.company_id;
  END IF;

  IF 'invoice_registration_number' = ANY (p_fields) THEN
    v_changes := v_changes || jsonb_build_object('invoice_registration_number',
      jsonb_build_object('from', v_company.invoice_registration_number,
                         'to', fp.invoice_registration_number));
    -- インボイス番号は UNIQUE。他社が持っていれば入れずに落とす
    IF fp.invoice_registration_number IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM companies
          WHERE invoice_registration_number = fp.invoice_registration_number
            AND id <> fp.company_id
       ) THEN
      UPDATE companies
         SET invoice_registration_number = fp.invoice_registration_number,
             invoice_registered = COALESCE(fp.qualified_invoice_issuer, invoice_registered),
             last_updated_by = v_actor
       WHERE id = fp.company_id;
    ELSE
      RAISE EXCEPTION 'このインボイス登録番号は別の事業者情報が使っています';
    END IF;
  END IF;

  INSERT INTO freee_sync_logs (freee_partner_id, direction, changes, succeeded, performed_by)
  VALUES (p_partner_id, 'to_crm', v_changes, TRUE, v_actor);

  RETURN v_changes;
END;
$$;

COMMENT ON FUNCTION apply_freee_values_to_crm IS
'freee 側の値のうち、人が選んだ項目だけを CRM へ取り込む。住所は対象外（entity_addresses の付け替えは画面から行う）';

REVOKE ALL ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_freee_values_to_crm(UUID, TEXT[], UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. freee へ書いた記録を残す（送信はアプリが行う）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_freee_push(
  p_partner_id UUID,
  p_changes    JSONB,
  p_succeeded  BOOLEAN,
  p_error      TEXT DEFAULT NULL,
  p_actor      UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO freee_sync_logs (
    freee_partner_id, direction, changes, succeeded, error_message, performed_by
  ) VALUES (
    p_partner_id, 'to_freee', COALESCE(p_changes, '{}'::JSONB), p_succeeded, p_error,
    COALESCE(auth.uid(), p_actor)
  );
END;
$$;

COMMENT ON FUNCTION record_freee_push IS
'CRM → freee の書き込み結果を記録する。失敗も残す（送ったが弾かれた、を追えるように）';

REVOKE ALL ON FUNCTION record_freee_push(UUID, JSONB, BOOLEAN, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_freee_push(UUID, JSONB, BOOLEAN, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION record_freee_push(UUID, JSONB, BOOLEAN, TEXT, UUID) TO service_role;

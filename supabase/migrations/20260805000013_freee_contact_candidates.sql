-- ============================================================
-- freee の担当者名から、CRM の連絡先の候補を出す
--
-- 背景（2026-08-04 の指示）:
--   freee は担当者を `contact_name` の**文字列 1 つ**で持ち、CRM は
--   `contacts` への参照で持つ。CRM → freee は組み立てるだけで済むが、
--   逆は「文字列から人を特定する」ことになり、姓と名の切れ目が分からず
--   同名の別人もいるため、自動で結ぶと**別人の連絡先に紐づく**。
--
-- 方針:
--   - **候補を出して人が選ぶ。** 自動では結ばない
--     （突合と同じ考え方。自動はインボイス番号の一致だけ、という既存方針に揃える）
--   - 候補が見つからないときは**何もしない**。連絡先は作らない
--     （姓名の分割を推測すると contacts が汚れる）
--   - 探す範囲は**その事業者に紐づく連絡先だけ**。全件から探すと同名の別人を拾う
-- ============================================================

-- 氏名の比較用。空白（半角・全角）を落として比べる
-- （freee は「鈴木 次郎」、CRM は「鈴木」「次郎」と分かれているため）
CREATE OR REPLACE FUNCTION normalize_person_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p_name, ''), '[[:space:]　]', '', 'g'), '');
$$;

COMMENT ON FUNCTION normalize_person_name IS
'氏名の突き合わせ用に空白を落とす。freee は氏名を 1 項目で持つため、CRM 側の姓+名と比べるのに要る';

/**
 * freee の担当者名に対する連絡先の候補。
 *
 * 一致の強さ（reason）:
 *   exact_full   … 姓＋ミドル名＋名 が一致
 *   exact_name   … 姓＋名 が一致（ミドル名を無視）
 *   last_name    … 姓だけ一致（弱い。人が確認する前提）
 */
CREATE OR REPLACE FUNCTION detect_freee_contact_candidates(p_partner_id UUID)
RETURNS TABLE (
  contact_id   UUID,
  contact_name TEXT,
  reason       TEXT,
  is_primary   BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  fp        freee_partners%ROWTYPE;
  v_target  TEXT;
BEGIN
  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND OR fp.company_id IS NULL THEN
    RETURN;
  END IF;

  v_target := normalize_person_name(fp.contact_name);
  IF v_target IS NULL THEN
    RETURN;  -- freee 側が空なら候補を出さない
  END IF;

  RETURN QUERY
  SELECT c.id,
         btrim(concat_ws(' ',
           NULLIF(btrim(COALESCE(c.last_name, '')), ''),
           NULLIF(btrim(COALESCE(c.middle_name, '')), ''),
           NULLIF(btrim(COALESCE(c.first_name, '')), '')
         )),
         m.reason,
         (co.primary_contact_id = c.id) AS is_primary
    FROM contacts c
    JOIN companies co ON co.id = fp.company_id
    JOIN LATERAL (
      SELECT CASE
        WHEN normalize_person_name(
               concat(c.last_name, c.middle_name, c.first_name)) = v_target
          THEN 'exact_full'
        WHEN normalize_person_name(concat(c.last_name, c.first_name)) = v_target
          THEN 'exact_name'
        WHEN normalize_person_name(c.last_name) = v_target
          THEN 'last_name'
      END AS reason
    ) m ON m.reason IS NOT NULL
   -- **その事業者に紐づく連絡先だけ**を見る。全件から探すと同名の別人を拾う
   WHERE c.company_id = fp.company_id
     AND c.deleted_at IS NULL
   ORDER BY CASE m.reason
              WHEN 'exact_full' THEN 1
              WHEN 'exact_name' THEN 2
              ELSE 3
            END,
            c.last_name, c.first_name;
END;
$$;

COMMENT ON FUNCTION detect_freee_contact_candidates IS
'freee の担当者名に近い連絡先の候補。提案のみで自動確定には使わない。範囲はその事業者に紐づく連絡先だけ';

REVOKE ALL ON FUNCTION detect_freee_contact_candidates(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION detect_freee_contact_candidates(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 主担当の確定（人が候補から選んだとき）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_company_primary_contact_from_freee(
  p_partner_id UUID,
  p_contact_id UUID,
  p_actor      UUID DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  fp      freee_partners%ROWTYPE;
  v_actor UUID := COALESCE(auth.uid(), p_actor);
  v_prev  UUID;
BEGIN
  IF NOT COALESCE(is_admin(), FALSE) THEN
    RAISE EXCEPTION 'freee との同期は admin だけが行えます';
  END IF;

  SELECT * INTO fp FROM freee_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'freee 取引先が見つかりません'; END IF;
  IF fp.company_id IS NULL THEN RAISE EXCEPTION '事業者情報に紐付いていません'; END IF;

  -- **その事業者の連絡先であることを必ず確認する。**
  -- 画面から任意の ID を送られても、別の事業者の連絡先は紐づけない
  IF NOT EXISTS (
    SELECT 1 FROM contacts
     WHERE id = p_contact_id
       AND company_id = fp.company_id
       AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'この連絡先は対象の事業者に属していません';
  END IF;

  SELECT primary_contact_id INTO v_prev FROM companies WHERE id = fp.company_id;

  UPDATE companies
     SET primary_contact_id = p_contact_id,
         last_updated_by = v_actor
   WHERE id = fp.company_id;

  INSERT INTO freee_sync_logs (freee_partner_id, direction, changes, succeeded, performed_by)
  VALUES (
    p_partner_id, 'to_crm',
    jsonb_build_object('primary_contact_id',
      jsonb_build_object('from', v_prev, 'to', p_contact_id)),
    TRUE, v_actor
  );
END;
$$;

COMMENT ON FUNCTION set_company_primary_contact_from_freee IS
'freee の担当者名から選んだ連絡先を事業者の主担当にする。連絡先は作らない（候補が無ければ何もしない）';

REVOKE ALL ON FUNCTION set_company_primary_contact_from_freee(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_company_primary_contact_from_freee(UUID, UUID, UUID) TO authenticated;

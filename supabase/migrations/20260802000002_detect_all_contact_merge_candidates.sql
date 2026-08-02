-- ============================================================
-- 統合候補の一括検出
--
-- これまで候補の検出は名刺取込の中でしか走らなかった（取り込んだ連絡先 1 件ずつ）。
-- 取込より前から居る連絡先どうしの重複は、誰も検出しないまま残る。
-- 棚卸しのために全件を突き合わせる入口を用意する。
--
-- 判定条件が 1 件版と食い違うと候補の意味が変わってしまうので、
-- 組を返す関数に切り出して両方の入口から使う。
--
-- 設計: docs/contact-identity.md § 4
-- ============================================================

-- ------------------------------------------------------------
-- 統合候補になる組を返す。
-- p_contact_id を指定するとその連絡先に関わる組だけ、NULL なら全件。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION contact_merge_candidate_pairs(p_contact_id UUID DEFAULT NULL)
RETURNS TABLE (
  contact_id           UUID,
  candidate_contact_id UUID,
  contact_company_id   UUID,
  candidate_company_id UUID
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  -- ペアの向きは UUID の小さい方を先にして揃える。(A,B) と (B,A) を別の候補にしない
  SELECT
    CASE WHEN a.id < b.id THEN a.id         ELSE b.id         END,
    CASE WHEN a.id < b.id THEN b.id         ELSE a.id         END,
    CASE WHEN a.id < b.id THEN a.company_id ELSE b.company_id END,
    CASE WHEN a.id < b.id THEN b.company_id ELSE a.company_id END
    FROM contacts a
    JOIN contacts b
      ON b.id <> a.id
     AND b.last_name = a.last_name
     AND COALESCE(b.first_name, '') = COALESCE(a.first_name, '')
     -- 同じ会社なら同定の段階（P3）で同一人物にしている。ここへ来るのは会社が違う組
     AND b.company_id IS DISTINCT FROM a.company_id
     AND b.deleted_at IS NULL
     AND b.merged_into_contact_id IS NULL
     -- カナが両方あって食い違うなら別人。候補にも挙げない（誤検知を減らす）
     AND (a.last_name_kana  IS NULL OR b.last_name_kana  IS NULL OR a.last_name_kana  = b.last_name_kana)
     AND (a.first_name_kana IS NULL OR b.first_name_kana IS NULL OR a.first_name_kana = b.first_name_kana)
   WHERE a.deleted_at IS NULL
     AND a.merged_into_contact_id IS NULL
     AND (p_contact_id IS NULL OR a.id = p_contact_id)
     -- 全件のときは片側から見れば足りる。1 件指定のときは相手が
     -- どちら側であっても拾えるよう、この絞りをかけない
     AND (p_contact_id IS NOT NULL OR a.id < b.id);
$$;

COMMENT ON FUNCTION contact_merge_candidate_pairs(UUID) IS
  '統合候補になる連絡先の組を返す。姓名一致・会社違い・カナ不一致は除外';

-- ------------------------------------------------------------
-- 候補の記録。直接は呼ばず、下の 2 つの入口から使う。
--
-- SECURITY DEFINER にするのは、取込中に呼ばれても RLS で書けない
-- ことが無いようにするため。読み書きは候補テーブルに閉じている。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_contact_merge_candidates(p_contact_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH inserted AS (
    INSERT INTO contact_merge_candidates (contact_id, candidate_contact_id, reason, detail)
    SELECT
      p.contact_id,
      p.candidate_contact_id,
      'same_name_diff_company',
      jsonb_build_object(
        'matched', jsonb_build_array('last_name', 'first_name'),
        'differs', jsonb_build_object(
          'company_id', jsonb_build_array(p.contact_company_id, p.candidate_company_id)
        )
      )
      FROM contact_merge_candidate_pairs(p_contact_id) p
    -- 既に挙がっている組（判断済みを含む）は数えない
    ON CONFLICT (contact_id, candidate_contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION record_contact_merge_candidates(UUID) IS
  '統合候補を記録して新規件数を返す。NULL で全件。入口は detect_* の 2 つ';

-- ------------------------------------------------------------
-- 1 件分の検出。名刺取込の中から呼ばれる
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_contact_merge_candidates(p_contact_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT record_contact_merge_candidates(p_contact_id);
$$;

COMMENT ON FUNCTION detect_contact_merge_candidates(UUID) IS
  '姓名が一致し会社が違う連絡先を統合候補として記録する。自動統合はしない';

-- ------------------------------------------------------------
-- 全件の棚卸し。
--
-- 記録するだけで統合はしないが、判断待ちの山を作る操作なので
-- 統合と同じく manager 以上に限る。
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION detect_all_contact_merge_candidates()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT is_manager_or_above() THEN
    RAISE EXCEPTION '統合候補の検出には manager 以上の権限が必要です';
  END IF;

  RETURN record_contact_merge_candidates(NULL);
END;
$$;

COMMENT ON FUNCTION detect_all_contact_merge_candidates() IS
  '全連絡先を突き合わせて統合候補を記録する。新たに挙がった件数を返す。manager 以上';

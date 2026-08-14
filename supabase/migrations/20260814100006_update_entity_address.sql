-- ============================================================
-- 住所の更新を 1 トランザクションにまとめる（T-0104）
--
-- 背景:
--   住所は本体（`addresses`）と紐付け（`entity_addresses`）の 2 表に分かれている。
--   追加は `add_entity_address` が 1 トランザクションでやっているのに、
--   **更新だけアプリが 2 文に分けて UPDATE していた**。片方だけ通ると
--   「住所は変わったのにラベル・電話が古いまま」という食い違いが残る。
--   CLAUDE.md「複数テーブルへの書き込みは DB 関数にまとめる」に反する。
--
-- 方針:
--   - `add_entity_address` と対になる `update_entity_address` を作る
--   - 値の整形（空文字を NULL に落とす）は追加側と同じ規則にそろえる
--   - **楽観ロックもここで見る**（T-0096）。`p_expected_updated_at` を渡した場合、
--     `entity_addresses.updated_at` が一致しなければ 0 行更新になるので例外にする。
--     アプリ側で 2 回に分けて確かめると、その間に他の人が保存できてしまう
--   - SECURITY INVOKER。RLS（`is_entity_address_accessible`）はそのまま効く
--   - 紐付けが owner のものでなければ 0 行になる。**黙って成功にしない**
-- ============================================================

CREATE OR REPLACE FUNCTION update_entity_address(
  p_owner_type          TEXT,
  p_owner_id            UUID,
  p_link_id             UUID,
  p_postal_code         TEXT,
  p_prefecture          TEXT,
  p_city                TEXT,
  p_address_line1       TEXT,
  p_address_line2       TEXT,
  p_label               TEXT DEFAULT 'main',
  p_phone               TEXT DEFAULT NULL,
  p_fax                 TEXT DEFAULT NULL,
  p_memo                TEXT DEFAULT NULL,
  p_actor               UUID DEFAULT NULL,
  -- 楽観ロック。NULL なら条件に足さない
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_address_id UUID;
  v_updated    INTEGER;
BEGIN
  IF p_owner_type NOT IN ('contact', 'company', 'account') THEN
    RAISE EXCEPTION '紐づけ先の種別が不正です: %', p_owner_type;
  END IF;

  -- 紐付けを持ち主ごと特定する。他人の住所 ID を渡されても当たらない
  SELECT address_id INTO v_address_id
    FROM entity_addresses
   WHERE id = p_link_id
     AND (
       (p_owner_type = 'contact' AND contact_id = p_owner_id)
       OR (p_owner_type = 'company' AND company_id = p_owner_id)
       OR (p_owner_type = 'account' AND account_id = p_owner_id)
     );

  IF v_address_id IS NULL THEN
    RAISE EXCEPTION '住所が見つかりません';
  END IF;

  -- ── 1. 紐付け（先に更新する。楽観ロックの判定をここで済ませる） ──────────
  UPDATE entity_addresses
     SET label           = COALESCE(p_label, 'main'),
         phone           = NULLIF(btrim(COALESCE(p_phone, '')), ''),
         fax             = NULLIF(btrim(COALESCE(p_fax, '')), ''),
         memo            = NULLIF(btrim(COALESCE(p_memo, '')), ''),
         last_updated_by = p_actor
   WHERE id = p_link_id
     AND (p_expected_updated_at IS NULL OR updated_at = p_expected_updated_at);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    -- 楽観ロックの競合か、RLS で弾かれたか。文言はアプリ側で出し分ける
    RAISE EXCEPTION 'CONFLICT: 住所は他のユーザーによって更新されています';
  END IF;

  -- ── 2. 住所本体 ──────────────────────────────────────────────────────────
  UPDATE addresses
     SET postal_code     = NULLIF(btrim(COALESCE(p_postal_code, '')), ''),
         prefecture      = NULLIF(btrim(COALESCE(p_prefecture, '')), ''),
         city            = NULLIF(btrim(COALESCE(p_city, '')), ''),
         address_line1   = NULLIF(btrim(COALESCE(p_address_line1, '')), ''),
         address_line2   = NULLIF(btrim(COALESCE(p_address_line2, '')), ''),
         last_updated_by = p_actor
   WHERE id = v_address_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    -- **紐付けだけ変わって住所本体が古いまま、が元の不具合。** 例外にして巻き戻す
    RAISE EXCEPTION '住所を更新できませんでした（住所本体の権限を確認してください）';
  END IF;
END;
$$;

COMMENT ON FUNCTION update_entity_address(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ) IS
  '住所本体と紐付けを単一トランザクションで更新する。add_entity_address と対（T-0104）。楽観ロックもここで見る（T-0096）';

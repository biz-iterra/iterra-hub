-- ============================================================
-- サンプル取引データ（開発環境専用）
-- 画面確認用のダミー。カンパニー / アカウント / コンタクト / ディール /
-- タレント / キャンペーンを含む。本番へは投入しないこと。
-- ============================================================

-- ============================================================
-- (旧 M24 → M27 に繰り上げ) campaigns（サンプル3件）
-- ============================================================
INSERT INTO campaigns (id, name, type, description, status, created_by, last_updated_by) VALUES
  ('a3000000-0000-0000-0000-000000000001', '製造業DX獲得キャンペーン',   'generation',    '製造業向けDX推進施策の新規リード獲得',     'active', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000002', '資料送付後ナーチャリング',   'nurturing',     '資料送付済みリードへの継続フォロー施策',   'active', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('a3000000-0000-0000-0000-000000000003', 'アポ獲得後選定加速施策',     'qualification', 'アポ確定後の商談化促進キャンペーン',       'draft',  'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');


-- ============================================================
-- サンプルデータ: カンパニー・アカウント・コンタクト・ディール
-- ============================================================

-- カンパニー
INSERT INTO companies (id, name, name_kana, corporate_type_id, company_status_id, phone, owner_user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '株式会社サンプル', 'カブシキガイシャサンプル',
    (SELECT id FROM corporate_types WHERE name = '株式会社'),
    -- **UUID を直書きしない。** 旧ステータスを指したまま残る事故が実際に起きた
    -- （本番で 27 件。2026-08-05）。役割フラグで引く
    (SELECT id FROM company_statuses WHERE is_new_default AND deleted_at IS NULL),
    '03-1234-5678', 'a0000000-0000-0000-0000-000000000002');

-- アカウント
INSERT INTO accounts (id, name, company_id, account_status_id, owner_user_id) VALUES
  ('20000000-0000-0000-0000-000000000001', '株式会社サンプル',
    '10000000-0000-0000-0000-000000000001',
    (SELECT id FROM account_statuses WHERE is_active_default AND deleted_at IS NULL),
    'a0000000-0000-0000-0000-000000000002');

-- コンタクト
-- 生年月日 1975-08-15 → 獅子座 / potential_number=37（type=IL+）。§10 の算出式に基づく
INSERT INTO contacts (
  id, last_name, first_name, last_name_kana, first_name_kana,
  contact_status_id, contact_type, company_id, department, job_title,
  birth_date, blood_type, potential_number, constellation_id,
  owner_user_id
) VALUES
  ('30000000-0000-0000-0000-000000000001', '山田', '太郎', 'ヤマダ', 'タロウ',
    (SELECT id FROM contact_statuses WHERE is_new_default AND deleted_at IS NULL), 'corporate_rep',
    '10000000-0000-0000-0000-000000000001',
    '営業部', '部長',
    '1975-08-15', 'A', 37,
    (SELECT id FROM constellation_fortune_telling WHERE constellation = '獅子座'),
    'a0000000-0000-0000-0000-000000000003');

-- コンタクトメール
INSERT INTO contact_emails (contact_id, email, label, is_primary) VALUES
  ('30000000-0000-0000-0000-000000000001', 'yamada@sample.co.jp', 'work', TRUE);

-- コンタクト電話
INSERT INTO contact_phones (contact_id, phone, label, is_primary) VALUES
  ('30000000-0000-0000-0000-000000000001', '090-1234-5678', 'mobile', TRUE);

-- アカウント×コンタクト
INSERT INTO account_contacts (account_id, contact_id, role) VALUES
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'primary');

-- リード
--
-- **セールスのディールには元になったリードが必須**（pipeline_types.requires_lead。
-- T-0069）。ステージはディールを起こしてよい段階（is_deal_ready）から選ぶ。
-- **UUID や slug で名指ししない。** 役割フラグで引く
INSERT INTO leads (
  id, lead_name, stage_id, status_id, lead_source_id,
  company_id, contact_id, company_name, owner_user_id
) VALUES
  ('a4000000-0000-0000-0000-000000000001', '株式会社サンプル - Web制作の相談',
    (SELECT id FROM lead_stages
      WHERE is_deal_ready AND NOT requires_deal AND deleted_at IS NULL
      ORDER BY sort_order LIMIT 1),
    (SELECT s.id FROM lead_statuses s
       JOIN lead_stages g ON g.id = s.stage_id
      WHERE g.is_deal_ready AND NOT g.requires_deal AND s.deleted_at IS NULL
      ORDER BY s.sort_order LIMIT 1),
    (SELECT id FROM lead_sources WHERE is_inquiry_default AND deleted_at IS NULL),
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '株式会社サンプル',
    'a0000000-0000-0000-0000-000000000003');

-- ディール
INSERT INTO deals (id, name, pipeline_type_id, deal_stage_id, deal_status_id, amount, account_id, lead_id, owner_user_id) VALUES
  ('40000000-0000-0000-0000-000000000001', 'サンプル案件 - Web制作',
    'b0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000002',
    'f1000000-0000-0000-0000-000000000003',
    1500000,
    '20000000-0000-0000-0000-000000000001',
    'a4000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000003');

-- ディール×サービス
INSERT INTO deal_services (deal_id, service_id) VALUES
  ('40000000-0000-0000-0000-000000000001', (SELECT id FROM services WHERE name = 'Web制作'));

-- ============================================================
-- タレント（サンプルコンタクト 山田太郎 に紐付く）
-- ============================================================
INSERT INTO talents (
  id, contact_id, personality_memo, custom_strengths, custom_weaknesses, aptitude_notes, overall_assessment
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '物腰が柔らかく、相手の意図を引き出すヒアリングが得意。商談では結論を急がず、関係構築を優先する傾向。',
  '顧客折衝、提案資料の作成、チームビルディング',
  '細かな数値管理や事務作業は後回しにしがち',
  '営業責任者や事業開発ポジションに適性。若手育成のメンター役にも向く。',
  '継続取引を生むリレーションシップ型の営業人材。マネジメント経験あり、スケール志向。'
);

-- タレント×スキル
INSERT INTO talent_skills (talent_id, skill_id, proficiency_level, years_experience, note) VALUES
  ('50000000-0000-0000-0000-000000000001',
    (SELECT id FROM skills WHERE skill_code = 'B13'),
    4, 10, '大型Web制作案件の PM 経験'),
  ('50000000-0000-0000-0000-000000000001',
    (SELECT id FROM skills WHERE skill_code = 'B09'),
    4,  8, 'クライアント要件整理を主導'),
  ('50000000-0000-0000-0000-000000000001',
    (SELECT id FROM skills WHERE skill_code = 'T20'),
    2,  2, 'ワイヤーレベルの作成は可能');

-- タレント経歴
INSERT INTO talent_careers (talent_id, career_type, organization, title, description, start_date, end_date, is_current, sort_order) VALUES
  ('50000000-0000-0000-0000-000000000001', 'work', '株式会社サンプル', '営業部 部長', '営業部門の統括、主要顧客の担当', '2020-04-01', NULL, TRUE, 1),
  ('50000000-0000-0000-0000-000000000001', 'work', '前職株式会社', '営業課長', 'BtoB 新規開拓とチームリード', '2015-04-01', '2020-03-31', FALSE, 2),
  ('50000000-0000-0000-0000-000000000001', 'education', '〇〇大学 経済学部', '学士（経済学）', NULL, '2007-04-01', '2011-03-31', FALSE, 3);


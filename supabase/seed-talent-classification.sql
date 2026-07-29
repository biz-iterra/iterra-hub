-- ============================================================
-- タレント分類マスタ seed（20260421000002 マイグレーション依存）
-- 投入数:
--   skill_categories  4件 (T/D/B/M 軸)
--   skills           99件
--   talent_system_tags 3件
--   talent_grades    16件
--   talent_grade_requirements 36件
--   talent_achievements_master 9件
--   talent_job_types 19件
--
-- 実行タイミング:
--   config.toml の sql_paths により seed.sql より先に読み込まれる。
--   スキル体系（skill_categories / skills）の正本は本ファイル。
--
-- 冪等性:
--   全 INSERT に ON CONFLICT DO NOTHING を付与。既存データは削除しない。
--   （旧実装は DELETE FROM talent_skills / skills を行っていたため、
--     本番で実行するとタレントの保有スキルが全消失する事故につながっていた）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- M09: スキルカテゴリ — 軸（T/D/B/M）ベース
-- ------------------------------------------------------------
INSERT INTO skill_categories (id, name, sort_order) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'Technical',  1),
  ('e1000000-0000-0000-0000-000000000002', 'Domain',     2),
  ('e1000000-0000-0000-0000-000000000003', 'Business',   3),
  ('e1000000-0000-0000-0000-000000000004', 'Management', 4)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- M10: スキル 99件（T:40 / D:31 / B:18 / M:10）
-- ------------------------------------------------------------
INSERT INTO skills (skill_code, skill_category_id, axis, name, system_tags, note, sort_order) VALUES
  -- T軸 40件
  ('T01','e1000000-0000-0000-0000-000000000001','T','Google Workspace 管理',ARRAY['G','SP'],'情シス基礎',1),
  ('T02','e1000000-0000-0000-0000-000000000001','T','Microsoft 365 管理',ARRAY['G','SP'],'情シス基礎',2),
  ('T03','e1000000-0000-0000-0000-000000000001','T','SaaS統合管理（ジョーシス等）',ARRAY['G','SP'],NULL,3),
  ('T04','e1000000-0000-0000-0000-000000000001','T','パスワード管理基盤（1Password等）',ARRAY['G','SP'],NULL,4),
  ('T05','e1000000-0000-0000-0000-000000000001','T','MDM / エンドポイント管理',ARRAY['G','SP'],NULL,5),
  ('T06','e1000000-0000-0000-0000-000000000001','T','ネットワーク基盤',ARRAY['SP'],NULL,6),
  ('T07','e1000000-0000-0000-0000-000000000001','T','ハードウェア調達・キッティング',ARRAY['G'],NULL,7),
  ('T08','e1000000-0000-0000-0000-000000000001','T','AWS',ARRAY['SP'],NULL,8),
  ('T09','e1000000-0000-0000-0000-000000000001','T','GCP',ARRAY['SP'],NULL,9),
  ('T10','e1000000-0000-0000-0000-000000000001','T','Azure',ARRAY['SP'],NULL,10),
  ('T11','e1000000-0000-0000-0000-000000000001','T','Terraform / IaC',ARRAY['SP'],NULL,11),
  ('T12','e1000000-0000-0000-0000-000000000001','T','Kubernetes / コンテナ',ARRAY['SP'],NULL,12),
  ('T13','e1000000-0000-0000-0000-000000000001','T','CI/CD',ARRAY['SP'],NULL,13),
  ('T14','e1000000-0000-0000-0000-000000000001','T','フロントエンド開発（React/Vue/Next.js等）',ARRAY['SP'],NULL,14),
  ('T15','e1000000-0000-0000-0000-000000000001','T','バックエンド開発（Node.js/Python/Go等）',ARRAY['SP'],NULL,15),
  ('T16','e1000000-0000-0000-0000-000000000001','T','モバイル開発（iOS/Android）',ARRAY['SP'],NULL,16),
  ('T17','e1000000-0000-0000-0000-000000000001','T','データベース設計・運用',ARRAY['SP'],NULL,17),
  ('T18','e1000000-0000-0000-0000-000000000001','T','API設計',ARRAY['SP'],NULL,18),
  ('T19','e1000000-0000-0000-0000-000000000001','T','セキュリティ実装（脆弱性対策・暗号化）',ARRAY['SP','G'],NULL,19),
  ('T20','e1000000-0000-0000-0000-000000000001','T','UIデザイン（Figma/Sketch等）',ARRAY['SP'],NULL,20),
  ('T21','e1000000-0000-0000-0000-000000000001','T','UX / IA 設計',ARRAY['SP'],NULL,21),
  ('T22','e1000000-0000-0000-0000-000000000001','T','グラフィックデザイン（Illustrator/Photoshop）',ARRAY['SP'],NULL,22),
  ('T23','e1000000-0000-0000-0000-000000000001','T','ブランディングデザイン',ARRAY['SP'],NULL,23),
  ('T24','e1000000-0000-0000-0000-000000000001','T','プロトタイピング',ARRAY['SP'],NULL,24),
  ('T25','e1000000-0000-0000-0000-000000000001','T','映像編集（Premiere等）',ARRAY['SP'],NULL,25),
  ('T26','e1000000-0000-0000-0000-000000000001','T','モーショングラフィックス（After Effects等）',ARRAY['SP'],NULL,26),
  ('T27','e1000000-0000-0000-0000-000000000001','T','3DCG',ARRAY['SP'],NULL,27),
  ('T28','e1000000-0000-0000-0000-000000000001','T','撮影・カメラワーク',ARRAY['SP'],NULL,28),
  ('T29','e1000000-0000-0000-0000-000000000001','T','サウンドデザイン',ARRAY['SP'],NULL,29),
  ('T30','e1000000-0000-0000-0000-000000000001','T','コピーライティング',ARRAY['SP'],NULL,30),
  ('T31','e1000000-0000-0000-0000-000000000001','T','テクニカルライティング',ARRAY['SP','G'],NULL,31),
  ('T32','e1000000-0000-0000-0000-000000000001','T','生成AI活用（ChatGPT/Claude等）',ARRAY['G','SP','CO'],'全系統必須化傾向',32),
  ('T33','e1000000-0000-0000-0000-000000000001','T','プロンプトエンジニアリング',ARRAY['G','SP'],NULL,33),
  ('T34','e1000000-0000-0000-0000-000000000001','T','SQL',ARRAY['G','SP'],NULL,34),
  ('T35','e1000000-0000-0000-0000-000000000001','T','データ分析（スプレッドシート応用）',ARRAY['G','SP','CO'],NULL,35),
  ('T36','e1000000-0000-0000-0000-000000000001','T','BIツール（Looker/Tableau等）',ARRAY['SP','CO'],NULL,36),
  ('T37','e1000000-0000-0000-0000-000000000001','T','RPA（UiPath/Power Automate等）',ARRAY['G','SP'],NULL,37),
  ('T38','e1000000-0000-0000-0000-000000000001','T','Office応用（Excel関数/マクロ/PowerPoint）',ARRAY['G','CO'],NULL,38),
  ('T39','e1000000-0000-0000-0000-000000000001','T','ノーコード/ローコード（Notion DB/kintone/Glide等）',ARRAY['G'],NULL,39),
  ('T40','e1000000-0000-0000-0000-000000000001','T','WordPress運用',ARRAY['G','SP'],NULL,40),

  -- D軸 31件
  ('D01','e1000000-0000-0000-0000-000000000002','D','情報システム運用',ARRAY['G','CO'],NULL,1),
  ('D02','e1000000-0000-0000-0000-000000000002','D','情シス戦略・IT統制',ARRAY['G','CO'],NULL,2),
  ('D03','e1000000-0000-0000-0000-000000000002','D','ヘルプデスク',ARRAY['G'],NULL,3),
  ('D04','e1000000-0000-0000-0000-000000000002','D','IT資産管理',ARRAY['G','CO'],NULL,4),
  ('D05','e1000000-0000-0000-0000-000000000002','D','SaaS選定・導入',ARRAY['G','SP'],NULL,5),
  ('D06','e1000000-0000-0000-0000-000000000002','D','オフィス移転プロジェクト',ARRAY['G','CO'],NULL,6),
  ('D07','e1000000-0000-0000-0000-000000000002','D','セキュリティポリシー策定',ARRAY['G','CO'],NULL,7),
  ('D08','e1000000-0000-0000-0000-000000000002','D','内部統制（J-SOX等）',ARRAY['CO'],NULL,8),
  ('D09','e1000000-0000-0000-0000-000000000002','D','経理・財務会計',ARRAY['CO'],NULL,9),
  ('D10','e1000000-0000-0000-0000-000000000002','D','管理会計',ARRAY['CO'],NULL,10),
  ('D11','e1000000-0000-0000-0000-000000000002','D','税務',ARRAY['CO'],NULL,11),
  ('D12','e1000000-0000-0000-0000-000000000002','D','予算策定・管理',ARRAY['CO','G'],NULL,12),
  ('D13','e1000000-0000-0000-0000-000000000002','D','資金繰り・キャッシュフロー管理',ARRAY['CO','G'],NULL,13),
  ('D14','e1000000-0000-0000-0000-000000000002','D','人事制度設計',ARRAY['CO'],NULL,14),
  ('D15','e1000000-0000-0000-0000-000000000002','D','採用オペレーション',ARRAY['CO','G'],NULL,15),
  ('D16','e1000000-0000-0000-0000-000000000002','D','労務管理・給与計算',ARRAY['CO'],NULL,16),
  ('D17','e1000000-0000-0000-0000-000000000002','D','法務・契約レビュー',ARRAY['CO'],NULL,17),
  ('D18','e1000000-0000-0000-0000-000000000002','D','知的財産',ARRAY['CO'],NULL,18),
  ('D19','e1000000-0000-0000-0000-000000000002','D','コンプライアンス・内部通報対応',ARRAY['CO'],NULL,19),
  ('D20','e1000000-0000-0000-0000-000000000002','D','経営企画',ARRAY['CO','G'],NULL,20),
  ('D21','e1000000-0000-0000-0000-000000000002','D','経営管理',ARRAY['CO','G'],NULL,21),
  ('D22','e1000000-0000-0000-0000-000000000002','D','事業計画立案',ARRAY['CO','G'],NULL,22),
  ('D23','e1000000-0000-0000-0000-000000000002','D','KPI設計・モニタリング',ARRAY['G','CO'],NULL,23),
  ('D24','e1000000-0000-0000-0000-000000000002','D','総務・ファシリティ',ARRAY['G','CO'],NULL,24),
  ('D25','e1000000-0000-0000-0000-000000000002','D','広報・IR',ARRAY['CO'],NULL,25),
  ('D26','e1000000-0000-0000-0000-000000000002','D','マーケティング基礎',ARRAY['G','SP'],NULL,26),
  ('D27','e1000000-0000-0000-0000-000000000002','D','セールス / BD',ARRAY['G','SP'],NULL,27),
  ('D28','e1000000-0000-0000-0000-000000000002','D','DX推進・業務改善',ARRAY['G'],NULL,28),
  ('D29','e1000000-0000-0000-0000-000000000002','D','上場準備（IPO）',ARRAY['CO'],NULL,29),
  ('D30','e1000000-0000-0000-0000-000000000002','D','M&A・アライアンス',ARRAY['CO'],NULL,30),
  ('D31','e1000000-0000-0000-0000-000000000002','D','助成金・補助金活用',ARRAY['CO','G'],NULL,31),

  -- B軸 18件
  ('B01','e1000000-0000-0000-0000-000000000003','B','報連相・基本コミュニケーション',ARRAY['G','SP','CO'],'全系統基礎',1),
  ('B02','e1000000-0000-0000-0000-000000000003','B','業務ドキュメンテーション',ARRAY['G','SP','CO'],NULL,2),
  ('B03','e1000000-0000-0000-0000-000000000003','B','期日管理・タスク管理',ARRAY['G','SP','CO'],NULL,3),
  ('B04','e1000000-0000-0000-0000-000000000003','B','会議ファシリテーション',ARRAY['G','CO'],NULL,4),
  ('B05','e1000000-0000-0000-0000-000000000003','B','プレゼンテーション',ARRAY['G','SP','CO'],NULL,5),
  ('B06','e1000000-0000-0000-0000-000000000003','B','交渉・折衝',ARRAY['G','CO'],NULL,6),
  ('B07','e1000000-0000-0000-0000-000000000003','B','提案構築',ARRAY['G','SP','CO'],NULL,7),
  ('B08','e1000000-0000-0000-0000-000000000003','B','顧客対応（BtoB）',ARRAY['G','SP','CO'],NULL,8),
  ('B09','e1000000-0000-0000-0000-000000000003','B','課題分析・論点整理',ARRAY['G','SP','CO'],NULL,9),
  ('B10','e1000000-0000-0000-0000-000000000003','B','問題解決・仮説思考',ARRAY['G','SP','CO'],NULL,10),
  ('B11','e1000000-0000-0000-0000-000000000003','B','定性・定量分析',ARRAY['G','SP','CO'],NULL,11),
  ('B12','e1000000-0000-0000-0000-000000000003','B','リサーチ',ARRAY['G','SP','CO'],NULL,12),
  ('B13','e1000000-0000-0000-0000-000000000003','B','プロジェクトマネジメント',ARRAY['G','SP','CO'],NULL,13),
  ('B14','e1000000-0000-0000-0000-000000000003','B','見積・工数見積',ARRAY['G','SP','CO'],NULL,14),
  ('B15','e1000000-0000-0000-0000-000000000003','B','コスト管理',ARRAY['G','CO'],NULL,15),
  ('B16','e1000000-0000-0000-0000-000000000003','B','優先順位付け・トリアージ',ARRAY['G','SP','CO'],NULL,16),
  ('B17','e1000000-0000-0000-0000-000000000003','B','英語（業務コミュニケーション）',ARRAY['G','SP','CO'],NULL,17),
  ('B18','e1000000-0000-0000-0000-000000000003','B','業務文書ライティング',ARRAY['G','SP','CO'],NULL,18),

  -- M軸 10件
  ('M01','e1000000-0000-0000-0000-000000000004','M','案件リード（プロジェクトオーナーシップ）',ARRAY['G','SP','CO'],'P以上必須',1),
  ('M02','e1000000-0000-0000-0000-000000000004','M','後輩・メンバー指導',ARRAY['G','SP','CO'],NULL,2),
  ('M03','e1000000-0000-0000-0000-000000000004','M','レビュー・フィードバック',ARRAY['G','SP','CO'],NULL,3),
  ('M04','e1000000-0000-0000-0000-000000000004','M','チームビルディング',ARRAY['G','SP','CO'],NULL,4),
  ('M05','e1000000-0000-0000-0000-000000000004','M','採用面接・選考',ARRAY['G','SP','CO'],NULL,5),
  ('M06','e1000000-0000-0000-0000-000000000004','M','目標設定・評価',ARRAY['G','SP','CO'],NULL,6),
  ('M07','e1000000-0000-0000-0000-000000000004','M','予算策定・管理',ARRAY['G','CO'],NULL,7),
  ('M08','e1000000-0000-0000-0000-000000000004','M','リスク管理',ARRAY['G','SP','CO'],NULL,8),
  ('M09','e1000000-0000-0000-0000-000000000004','M','組織設計・配置',ARRAY['G','CO'],NULL,9),
  ('M10','e1000000-0000-0000-0000-000000000004','M','ステークホルダーマネジメント',ARRAY['G','SP','CO'],NULL,10)
ON CONFLICT (skill_code) DO NOTHING;

-- ------------------------------------------------------------
-- 系統マスタ 3件
-- ------------------------------------------------------------
INSERT INTO talent_system_tags (system_code, name, definition, determination_rule, sort_order) VALUES
  ('G','ジェネラリスト','横断業務と高い適応力で複数領域を担当',
   '{"description":"Gタグ保有スキルを★2以上で10件以上、かつ★3以上を3件以上","conditions":[{"tag_filter":"G","min_star":2,"min_count":10},{"tag_filter":"G","min_star":3,"min_count":3}]}',
   1),
  ('SP','スペシャリスト','特定領域の深い専門性',
   '{"description":"SPタグ保有スキルを★4以上で1件以上、かつ★3以上を3件以上","conditions":[{"tag_filter":"SP","min_star":4,"min_count":1},{"tag_filter":"SP","min_star":3,"min_count":3}]}',
   2),
  ('CO','コーポレート','コーポレート機能領域の専門家',
   '{"description":"COタグ保有スキルを★3以上で3件以上、かつD軸COタグで★3以上を2件以上","conditions":[{"tag_filter":"CO","min_star":3,"min_count":3},{"tag_filter":"CO","axis_filter":"D","min_star":3,"min_count":2}]}',
   3)
ON CONFLICT (system_code) DO NOTHING;

-- ------------------------------------------------------------
-- グレードマスタ 16件
-- ------------------------------------------------------------
INSERT INTO talent_grades (grade_code, band, sort_order, years_min, years_max, expected_role, evaluation_points) VALUES
  ('A1','A', 1,  0,    0.5,  '指示された簡単なタスクを正確に実行できる',                  '基本ツール・技術の操作、指示の正確な理解・実行、報連相'),
  ('A2','A', 2,  0.5,  1,    '指示があれば基本タスクを単独で実行できる',                  '基本タスクの自律的実行、不明点の適切な質問'),
  ('A3','A', 3,  1,    1.5,  '定型業務を指示なしで自律的に遂行できる',                    '定型業務の安定遂行、簡単な問題の自力調査・解決'),
  ('A4','A', 4,  1.5,  2,    'アソシエイト業務を安定してこなし次ステップへ意欲',           'アソシエイト業務全般の習得、Pグレードへの準備完了'),
  ('P1','P', 5,  2,    3,    '自身の専門分野で自律的に成果を出しチームに貢献',            '専門分野の実務活用、複雑タスク一部担当'),
  ('P2','P', 6,  3,    4,    '複数業務を効率的に管理・遂行し課題を解決できる',            '複数業務の並行管理、課題分析・解決策の提案実行'),
  ('P3','P', 7,  4,    5,    '期待以上の成果を出しチーム目標達成に大きく貢献',            '期待以上の成果、業務効率化・品質向上の改善提案'),
  ('P4','P', 8,  4.5,  5,    '専門スキル確立、難易度の高いタスク・小規模PJ推進',          '専門スキル確立、Sグレードへの準備完了'),
  ('S1','S', 9,  5,    6,    '高度スキルを活かし複雑問題解決で中心的役割',                '応用的ツール・技術習熟、複雑問題解決の主導'),
  ('S2','S',10,  6,    7,    'チームメンバー指導、PJ品質向上に具体的貢献',                '技術指導、PJ品質向上、他部署との調整・交渉'),
  ('S3','S',11,  7,    8,    '複数メンバーの成果レビュー、チームパフォーマンス向上',       'レビュー・フィードバック、PJリスク管理・技術選定'),
  ('S4','S',12,  7.5,  8,    '専門領域で揺るぎない地位、組織全体への影響力',              '組織全体への影響、新技術・手法の導入推進'),
  ('L1','L',13,  8,    9,    '組織全体の技術戦略・品質向上に提言し牽引',                  '戦略・品質への提言、複数PJ横断の技術指導'),
  ('L2','L',14,  9,   10,    '大規模システム設計・アーキテクチャ策定を主導',              'アーキテクチャ主導、技術的負債解消・生産性向上'),
  ('L3','L',15, 10,   12,    '新技術導入で競争優位を確立、組織の技術底上げ',              '業界トレンド・新技術の導入、後進育成・ナレッジ共有'),
  ('L4','L',16, 12,   NULL,  '事業戦略に直結する技術的意思決定、技術的プレゼンス',        '事業戦略の意思決定、外部貢献・会社の技術的プレゼンス')
ON CONFLICT (grade_code) DO NOTHING;

-- ------------------------------------------------------------
-- 昇格要件マスタ 36件（G×12 + SP×12 + CO×12 = A2〜L1）
-- skill_ids_any_pool は JSONB 内文字列として保持、判定ロジック側で解決
-- ------------------------------------------------------------
INSERT INTO talent_grade_requirements (system_code, grade_code, skill_thresholds, required_achievements, sort_order) VALUES
  -- G系統 12件
  ('G','A2','[{"axis_filter":"D","min_star":2,"min_count":1},{"axis_filter":"B","min_star":2,"min_count":2}]',ARRAY[]::TEXT[],1),
  ('G','A3','[{"axis_filter":"D","min_star":2,"min_count":2},{"axis_filter":"B","min_star":2,"min_count":3}]',ARRAY[]::TEXT[],2),
  ('G','A4','[{"axis_filter":"D","min_star":3,"min_count":1},{"axis_filter":"D","min_star":2,"min_count":2},{"axis_filter":"B","min_star":3,"min_count":2}]',ARRAY[]::TEXT[],3),
  ('G','P1','[{"axis_filter":"D","min_star":3,"min_count":3},{"axis_filter":"B","min_star":3,"min_count":3},{"axis_filter":"M","min_star":2,"min_count":1}]',ARRAY[]::TEXT[],4),
  ('G','P2','[{"axis_filter":"D","min_star":3,"min_count":4},{"axis_filter":"B","min_star":3,"min_count":4},{"axis_filter":"M","min_star":3,"min_count":1}]',ARRAY[]::TEXT[],5),
  ('G','P3','[{"axis_filter":"D","min_star":4,"min_count":1},{"axis_filter":"D","min_star":3,"min_count":4},{"axis_filter":"B","min_star":4,"min_count":2},{"axis_filter":"M","min_star":3,"min_count":2}]',ARRAY[]::TEXT[],6),
  ('G','P4','[{"axis_filter":"D","min_star":4,"min_count":2},{"axis_filter":"D","min_star":3,"min_count":4},{"axis_filter":"B","min_star":4,"min_count":3},{"axis_filter":"M","min_star":3,"min_count":3}]',ARRAY[]::TEXT[],7),
  ('G','S1','[{"axis_filter":"D","min_star":4,"min_count":3},{"axis_filter":"B","min_star":4,"min_count":4},{"axis_filter":"M","min_star":4,"min_count":2}]',ARRAY['LEAD_PROJECT'],8),
  ('G','S2','[{"axis_filter":"D","min_star":4,"min_count":4},{"axis_filter":"M","min_star":4,"min_count":3}]',ARRAY['MENTOR_JUNIOR'],9),
  ('G','S3','[{"axis_filter":"D","min_star":5,"min_count":1},{"axis_filter":"D","min_star":4,"min_count":4},{"axis_filter":"M","min_star":4,"min_count":4}]',ARRAY['MULTI_PJ_DIRECT'],10),
  ('G','S4','[{"axis_filter":"D","min_star":5,"min_count":2},{"axis_filter":"M","min_star":5,"min_count":1}]',ARRAY['ORG_INFLUENCE'],11),
  ('G','L1','[{"axis_filter":"D","min_star":5,"min_count":3}]',ARRAY['BIZ_STRATEGY'],12),

  -- SP系統 12件
  ('SP','A2','[{"axis_filter":"T","min_star":2,"min_count":1},{"axis_filter":"B","min_star":2,"min_count":1}]',ARRAY[]::TEXT[],13),
  ('SP','A3','[{"axis_filter":"T","min_star":2,"min_count":2},{"axis_filter":"B","min_star":2,"min_count":2}]',ARRAY[]::TEXT[],14),
  ('SP','A4','[{"axis_filter":"T","min_star":3,"min_count":1},{"axis_filter":"T","min_star":2,"min_count":2},{"axis_filter":"B","min_star":3,"min_count":1}]',ARRAY[]::TEXT[],15),
  ('SP','P1','[{"axis_filter":"T","min_star":3,"min_count":2},{"axis_filter":"B","min_star":3,"min_count":2},{"axis_filter":"M","min_star":2,"min_count":1}]',ARRAY[]::TEXT[],16),
  ('SP','P2','[{"axis_filter":"T","min_star":3,"min_count":3},{"axis_filter":"B","min_star":3,"min_count":3},{"axis_filter":"M","min_star":3,"min_count":1}]',ARRAY[]::TEXT[],17),
  ('SP','P3','[{"axis_filter":"T","min_star":4,"min_count":1},{"axis_filter":"T","min_star":3,"min_count":3},{"axis_filter":"B","min_star":3,"min_count":3},{"axis_filter":"M","min_star":3,"min_count":2}]',ARRAY[]::TEXT[],18),
  ('SP','P4','[{"axis_filter":"T","min_star":4,"min_count":2},{"axis_filter":"B","min_star":4,"min_count":2},{"axis_filter":"M","min_star":3,"min_count":3}]',ARRAY[]::TEXT[],19),
  ('SP','S1','[{"axis_filter":"T","min_star":4,"min_count":3},{"axis_filter":"M","min_star":4,"min_count":2}]',ARRAY['LEAD_PROJECT'],20),
  ('SP','S2','[{"axis_filter":"T","min_star":4,"min_count":4},{"axis_filter":"M","min_star":4,"min_count":3}]',ARRAY['MENTOR_JUNIOR'],21),
  ('SP','S3','[{"axis_filter":"T","min_star":5,"min_count":1},{"axis_filter":"T","min_star":4,"min_count":4}]',ARRAY['TECH_SELECTION'],22),
  ('SP','S4','[{"axis_filter":"T","min_star":5,"min_count":2},{"axis_filter":"M","min_star":5,"min_count":1}]',ARRAY['ORG_TECH_INFLUENCE'],23),
  ('SP','L1','[{"axis_filter":"T","min_star":5,"min_count":3}]',ARRAY['TECH_STRATEGY'],24),

  -- CO系統 12件
  ('CO','A2','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":2,"min_count":1},{"axis_filter":"B","min_star":2,"min_count":1}]',ARRAY[]::TEXT[],25),
  ('CO','A3','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":2,"min_count":2},{"axis_filter":"B","min_star":2,"min_count":2}]',ARRAY[]::TEXT[],26),
  ('CO','A4','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":3,"min_count":1},{"axis_filter":"D","min_star":2,"min_count":1},{"axis_filter":"B","min_star":3,"min_count":1}]',ARRAY[]::TEXT[],27),
  ('CO','P1','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":3,"min_count":2},{"axis_filter":"B","min_star":3,"min_count":2},{"axis_filter":"M","min_star":2,"min_count":1}]',ARRAY[]::TEXT[],28),
  ('CO','P2','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":3,"min_count":3},{"axis_filter":"B","min_star":3,"min_count":3},{"axis_filter":"M","min_star":3,"min_count":1}]',ARRAY[]::TEXT[],29),
  ('CO','P3','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":4,"min_count":1},{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":3,"min_count":2},{"axis_filter":"B","min_star":4,"min_count":2},{"axis_filter":"M","min_star":3,"min_count":2}]',ARRAY[]::TEXT[],30),
  ('CO','P4','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":4,"min_count":2},{"axis_filter":"M","min_star":3,"min_count":3}]',ARRAY[]::TEXT[],31),
  ('CO','S1','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":4,"min_count":3},{"axis_filter":"M","min_star":4,"min_count":2}]',ARRAY['LEAD_PROJECT'],32),
  ('CO','S2','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":4,"min_count":4},{"axis_filter":"M","min_star":4,"min_count":3}]',ARRAY['MENTOR_JUNIOR'],33),
  ('CO','S3','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":5,"min_count":1},{"axis_filter":"D","min_star":4,"min_count":3}]',ARRAY['MULTI_PJ_DIRECT'],34),
  ('CO','S4','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":5,"min_count":2},{"axis_filter":"M","min_star":5,"min_count":1}]',ARRAY['ORG_INFLUENCE'],35),
  ('CO','L1','[{"axis_filter":"D","skill_ids_any_pool":"d_co_system_skill_ids","min_star":5,"min_count":3}]',ARRAY['MGMT_STRATEGY'],36)
ON CONFLICT (system_code, grade_code) DO NOTHING;

-- ------------------------------------------------------------
-- 実績マスタ 9件
-- ------------------------------------------------------------
INSERT INTO talent_achievements_master (achievement_code, name, criteria, quantitative_threshold, sort_order) VALUES
  ('LEAD_PROJECT',      '案件リード実績',       'クライアント案件のプロジェクトオーナーとして2件以上を完遂',            '{"unit":"件","min_value":2}',1),
  ('MENTOR_JUNIOR',     '後輩育成実績',         '後輩スタッフ1名以上を1グレード以上昇格させた実績',                     '{"unit":"名","min_value":1}',2),
  ('MULTI_PJ_DIRECT',   '複数PJ統括実績',       '並行する3件以上のプロジェクトの統括を6ヶ月以上継続',                   '{"unit":"件","min_value":3,"duration_months":6}',3),
  ('TECH_SELECTION',    '技術選定リード実績',   '重要な技術選定（アーキ、フレームワーク、基盤ツール等）を主導し採用',   NULL,4),
  ('ORG_INFLUENCE',     '組織影響実績',         '組織全体に影響する改善・提言を実現（制度設計、全社ツール導入等）',     NULL,5),
  ('ORG_TECH_INFLUENCE','組織技術影響実績',     '技術的な改善・提言が組織全体に採用され、他プロジェクトに波及',         NULL,6),
  ('BIZ_STRATEGY',      '事業/戦略提言実績',   '事業戦略または組織戦略に直結する提言が経営層に採用された実績',         NULL,7),
  ('TECH_STRATEGY',     '技術戦略提言実績',     '技術戦略（ロードマップ・プラットフォーム選定等）を提言し採用された',   NULL,8),
  ('MGMT_STRATEGY',     '経営/戦略提言実績',   '経営意思決定に関わる提言が採用された実績',                             NULL,9)
ON CONFLICT (achievement_code) DO NOTHING;

-- ------------------------------------------------------------
-- 職種マスタ 19件
-- ------------------------------------------------------------
INSERT INTO talent_job_types (job_type_code, name, category, rules, sort_order) VALUES
  ('ENG_BACKEND',   'エンジニア（バックエンド）','エンジニア',  '[{"skill_ids_any":["T15","T17","T18"],"min_star":3}]',1),
  ('ENG_FRONTEND',  'エンジニア（フロント）',    'エンジニア',  '[{"skill_ids_any":["T14"],"min_star":3}]',2),
  ('ENG_INFRA',     'エンジニア（インフラ）',    'エンジニア',  '[{"skill_ids_any":["T08","T09","T10"],"min_star":3},{"skill_ids_any":["T11"],"min_star":2}]',3),
  ('ENG_SECURITY',  'エンジニア（セキュリティ）','エンジニア',  '[{"skill_ids_any":["T19"],"min_star":4},{"skill_ids_any":["D07"],"min_star":3}]',4),
  ('IT_CORP',       '情シス / 社内SE',           '情シス',      '[{"skill_ids_any":["D01"],"min_star":3},{"skill_ids_any":["T01","T02","T03"],"min_star":3}]',5),
  ('DESIGN_UI',     'デザイナー（UI）',          'デザイナー',  '[{"skill_ids_any":["T20"],"min_star":3}]',6),
  ('DESIGN_UX',     'デザイナー（UX）',          'デザイナー',  '[{"skill_ids_any":["T21"],"min_star":3}]',7),
  ('DESIGN_GRAPHIC','デザイナー（グラフィック）','デザイナー',  '[{"skill_ids_any":["T22"],"min_star":3}]',8),
  ('CREATIVE_VIDEO','クリエイター（映像）',      'クリエイター','[{"skill_ids_any":["T25"],"min_star":3},{"skill_ids_any":["T26"],"min_star":2}]',9),
  ('CREATIVE_WRITER','クリエイター（ライター）', 'クリエイター','[{"skill_ids_any":["T30","T31"],"min_star":3}]',10),
  ('CODER',         'コーダー',                  'エンジニア',  '[{"skill_ids_any":["T14"],"min_star":2},{"skill_ids_any":["T20"],"min_star":2}]',11),
  ('SALES',         'セールス',                  '営業',        '[{"skill_ids_any":["D27"],"min_star":3},{"skill_ids_any":["B06","B07"],"min_star":3}]',12),
  ('FINANCE',       '経理 / 財務担当',           'コーポレート','[{"skill_ids_any":["D09","D10"],"min_star":3}]',13),
  ('HR',            '人事 / 労務担当',           'コーポレート','[{"skill_ids_any":["D14","D15","D16"],"min_star":3}]',14),
  ('LEGAL',         '法務担当',                  'コーポレート','[{"skill_ids_any":["D17"],"min_star":3}]',15),
  ('PM',            'プロジェクトマネージャー',  'PM/リード',   '[{"skill_ids_any":["B13"],"min_star":4},{"skill_ids_any":["M01"],"min_star":3},{"skill_ids_any":["M02"],"min_star":3}]',16),
  ('CORP_PLAN',     '経営企画担当',              'コーポレート','[{"skill_ids_any":["D20","D22"],"min_star":3}]',17),
  ('ARCHITECT',     'アーキテクト',              'エンジニア',  '[{"axis_filter":"T","min_star":5,"min_count":1},{"axis_filter":"T","min_star":4,"min_count":3},{"skill_ids_any":["M01"],"min_star":4}]',18),
  ('AI_SPECIALIST', 'AIスペシャリスト',          'エンジニア',  '[{"skill_ids_any":["T32","T33"],"min_star":4}]',19)
ON CONFLICT (job_type_code) DO NOTHING;

COMMIT;

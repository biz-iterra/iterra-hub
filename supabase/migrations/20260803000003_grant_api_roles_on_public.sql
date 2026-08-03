-- ============================================================
-- public スキーマのテーブル権限を API ロールへ明示的に付与する
--
-- 背景:
--   Supabase では PostgREST がリクエストごとに anon / authenticated /
--   service_role へ SET ROLE し、行の絞り込みは RLS が担う。
--   その前提として「テーブルレベルの GRANT はある」必要がある。
--
--   従来は Supabase 側の ALTER DEFAULT PRIVILEGES で自動的に付いていたため
--   リポジトリに GRANT を書いていなかった。しかしローカルスタックの既定が
--   public スキーマだけ DML 抜き（TRUNCATE / REFERENCES / TRIGGER のみ）に
--   狭められており、db reset 後は 87 テーブルすべてで
--   「permission denied for table ...」（PostgREST が 403）になる。
--
--   環境の既定値に依存していると同じ事故が再発するため、必要な権限を
--   マイグレーションで明示する。GRANT は追加方向なので、既に権限が付いている
--   環境（本番など）に対しては何も変えない。
--
-- 付与しない相手:
--   - anon: 未ログインで public のテーブルを読む経路が無い（ログインは auth
--     スキーマ、問い合わせ同期は service_role）。RLS で止まる前に権限段階で
--     弾けるほうが安全なので、意図的に付与しない
--   - 関数: 既存マイグレーションが REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO
--     authenticated で個別に宣言している。ここで一括付与すると
--     purge_soft_deleted_records() のような運用専用関数まで
--     ログインユーザーから .rpc() で呼べてしまうため触らない
--
-- 行レベルの制御は従来どおり RLS が行う。ここでの GRANT は
-- 「テーブルに到達できる」ところまでで、誰がどの行を見られるかは変えない。
-- ============================================================

GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role;

-- 以降のマイグレーションで追加されるテーブルにも自動で付くようにする。
-- FOR ROLE を省略すると実行者（マイグレーションは postgres で流れる）が
-- 作るオブジェクトが対象になる
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

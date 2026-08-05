-- ============================================================
-- `supabase db push` が lock timeout で止まったときの診断
--
-- 経緯（2026-08-05）:
--   14 本の反映中に `ERROR: canceling statement due to lock timeout
--   (SQLSTATE 55P03)` で停止した。CLI はどの 1 本で止まったかを表示しない。
--
--   マイグレーションは **1 本ごとに 1 トランザクション**なので、
--   失敗した本は丸ごと巻き戻り、それより前の本は適用済みで残る。
--   **「どこまで進んだか」を先に確定させる**（推測で再実行しない）。
--
-- 原因になりやすいもの:
--   `ALTER TABLE` / `CREATE TRIGGER` は **ACCESS EXCLUSIVE ロック**を取る。
--   アプリ（NAS の Next.js）が対象テーブルを読んでいる間は取れない。
--   とくに `20260805000024` は **76 テーブルにトリガーを張る**ため、
--   稼働中に通すのは難しい。
--
-- 実行方法（①②は読み取りのみ。③は指示があるまで実行しない）:
--   Supabase ダッシュボード → SQL Editor
-- ============================================================

-- ------------------------------------------------------------
-- ① どこまで適用されたか
--
-- 今回の対象は 20260805000014 〜 000027 の 14 本。
-- ここに出た版までが適用済み。**出ていない番号から再開する**。
-- ------------------------------------------------------------
SELECT '① 適用済み' AS 区分, version, name
  FROM supabase_migrations.schema_migrations
 WHERE version >= '20260805000014'
 ORDER BY version;

-- 期待: 14 行揃えば完了。途中までなら、次の番号で止まったということ

-- ------------------------------------------------------------
-- ② 何がロックを掴んでいるか
--
-- `state` が `idle in transaction` のものが最も厄介
-- （何もしていないのにロックを持ち続ける）。
-- `query_start` が古いものから疑う。
-- ------------------------------------------------------------
SELECT '② 実行中の接続' AS 区分,
       pid,
       usename        AS ユーザー,
       application_name AS アプリ,
       state          AS 状態,
       now() - xact_start  AS トランザクション経過,
       now() - query_start AS クエリ経過,
       wait_event_type AS 待機種別,
       left(query, 120) AS クエリ
  FROM pg_stat_activity
 WHERE datname = current_database()
   AND pid <> pg_backend_pid()
   AND state <> 'idle'
 ORDER BY xact_start NULLS LAST;

-- 待ち合わせの関係（誰が誰を待たせているか）
SELECT '② ブロック関係' AS 区分,
       blocked.pid          AS 待たされている,
       blocked_act.state    AS 待機側の状態,
       left(blocked_act.query, 80)  AS 待機側のクエリ,
       blocking.pid         AS 掴んでいる,
       blocking_act.state   AS 保持側の状態,
       now() - blocking_act.xact_start AS 保持側の経過,
       left(blocking_act.query, 80) AS 保持側のクエリ
  FROM pg_locks blocked
  JOIN pg_stat_activity blocked_act ON blocked_act.pid = blocked.pid
  JOIN pg_locks blocking
    ON blocking.locktype = blocked.locktype
   AND blocking.database IS NOT DISTINCT FROM blocked.database
   AND blocking.relation IS NOT DISTINCT FROM blocked.relation
   AND blocking.granted
   AND blocking.pid <> blocked.pid
  JOIN pg_stat_activity blocking_act ON blocking_act.pid = blocking.pid
 WHERE NOT blocked.granted;

-- 0 行なら、今は詰まっていない（反映時だけ当たっていた）

-- ------------------------------------------------------------
-- ③ ロックを掴んだまま放置されている接続を切る
--
-- **②で「idle in transaction が長時間」を確認してから実行する。**
-- 実行中の業務クエリを切るとその操作が失敗する。
--
-- アプリ（NAS）を止めれば接続ごと消えるので、通常はそちらが安全。
-- それでも個別に切る場合は、下の pid を②で見えた値にしてから実行する
-- （空のままでは動かない。取り違えて別の接続を切らないための措置）。
-- ------------------------------------------------------------
-- SELECT pg_terminate_backend(
--   0   -- ← ②の「掴んでいる」列の pid に置き換える
-- );

-- 切った後の確認（対象の pid が消えていること）
-- SELECT pid, state, now() - xact_start AS 経過
--   FROM pg_stat_activity WHERE datname = current_database();

/**
 * seed 由来の固定値。docs/test-cases/02-integration-db.md §1.1 の対応表と揃える。
 * ステータス系マスタなど環境ごとに UUID が変わるものはここに置かず、
 * 各ケースで code / slug 等の意味のある列から引く（CLAUDE.md「マスタの id を直書きしない」）。
 */
export const USERS = {
  admin: "a0000000-0000-0000-0000-000000000001",
  manager: "a0000000-0000-0000-0000-000000000002",
  member: "a0000000-0000-0000-0000-000000000003",
  ogawa: "a0000000-0000-0000-0000-000000000010",
};

// pipeline_types は 01-masters.sql で固定 UUID を採番している（doc §1.1 に明記）ため直書きしてよい。
export const PIPELINE_TYPES = {
  sales: "b0000000-0000-0000-0000-000000000001",
  procurement: "b0000000-0000-0000-0000-000000000002",
  outsourcing: "b0000000-0000-0000-0000-000000000003",
};

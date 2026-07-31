/**
 * 合言葉の照合。
 *
 * OAuth の state（CSRF 対策）と、定期同期エンドポイントの Bearer トークンの
 * 両方で使う。どちらも「攻撃者が値を推測できるか」が問題になるため、
 * 比較にかかる時間から一致した長さが漏れないよう timingSafeEqual を通す。
 */

import { timingSafeEqual } from "node:crypto";

/** 長さが違うと timingSafeEqual が例外を投げるので先に弾く */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * `Authorization: Bearer <token>` を照合する。
 *
 * 期待値が空なら常に false。設定漏れのまま「空文字を送れば通る」状態に
 * ならないようにする。
 */
export function bearerMatches(
  header: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!expected) return false;
  if (!header) return false;

  // スキーム名の大小は RFC 上区別しない
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  return safeEqual(match[1].trim(), expected);
}

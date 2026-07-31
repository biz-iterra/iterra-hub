/**
 * リフレッシュトークンの暗号化。
 *
 * **アプリ側で暗号化してから DB へ渡す。** pgcrypto の pgp_sym_encrypt を
 * 使うと鍵を SQL の引数として DB へ送ることになり、鍵を DB に置かない
 * という前提が崩れる（接続の経路やログに乗りうる）。
 * ここで暗号文にしてしまえば、DB が受け取るのはバイト列だけになる。
 *
 * 方式は AES-256-GCM。改ざん検知が要るのは、復号できた文字列を
 * そのまま Google へ送るため（壊れた値を送ると原因の切り分けが難しくなる）。
 *
 * 保存形式: iv(12 bytes) || authTag(16 bytes) || ciphertext
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * 環境変数の鍵は長さがまちまち（base64 48 バイトなら 64 文字）なので、
 * SHA-256 で 32 バイトに畳んでから使う。鍵の書式を利用者に強制しないため。
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptToken(plain: string, secret: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptToken(payload: Buffer, secret: string): string {
  if (payload.length <= IV_LENGTH + TAG_LENGTH) {
    throw new Error("暗号文が短すぎます（保存形式が違う可能性）");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const enc = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * PostgreSQL の BYTEA リテラル（`\x` + 16 進）。
 * supabase-js は Buffer をそのまま送れないため、この形に直して渡す。
 */
export function toByteaLiteral(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

/** BYTEA を読み戻す。PostgREST は `\x...` の文字列で返す */
export function fromByteaLiteral(value: string): Buffer {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  return Buffer.from(hex, "hex");
}

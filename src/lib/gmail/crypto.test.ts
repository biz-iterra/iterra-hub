import { describe, expect, it } from "vitest";
import {
  decryptToken,
  encryptToken,
  fromByteaLiteral,
  toByteaLiteral,
} from "./crypto";

const KEY = "test-key-for-unit-test-do-not-use-in-production";
const TOKEN = "1//0eXaMpLe-refresh-token_value.with-symbols";

describe("encryptToken / decryptToken", () => {
  it("暗号化して復号すると元に戻る", () => {
    const enc = encryptToken(TOKEN, KEY);
    expect(decryptToken(enc, KEY)).toBe(TOKEN);
  });

  it("同じ値でも毎回違う暗号文になる（IV がランダム）", () => {
    const a = encryptToken(TOKEN, KEY);
    const b = encryptToken(TOKEN, KEY);
    expect(a.equals(b)).toBe(false);
    // それぞれ独立に復号できる
    expect(decryptToken(a, KEY)).toBe(TOKEN);
    expect(decryptToken(b, KEY)).toBe(TOKEN);
  });

  it("鍵が違うと復号できない", () => {
    const enc = encryptToken(TOKEN, KEY);
    expect(() => decryptToken(enc, "another-key")).toThrow();
  });

  it("暗号文を改ざんすると復号に失敗する", () => {
    const enc = encryptToken(TOKEN, KEY);
    const tampered = Buffer.from(enc);
    // 末尾（本文の一部）を 1 バイト書き換える
    tampered[tampered.length - 1] ^= 0xff;
    expect(() => decryptToken(tampered, KEY)).toThrow();
  });

  it("認証タグを改ざんすると復号に失敗する", () => {
    const enc = encryptToken(TOKEN, KEY);
    const tampered = Buffer.from(enc);
    // iv(12) の直後がタグ
    tampered[12] ^= 0xff;
    expect(() => decryptToken(tampered, KEY)).toThrow();
  });

  it("短すぎる入力は形式違いとして弾く", () => {
    expect(() => decryptToken(Buffer.alloc(8), KEY)).toThrow(/短すぎ/);
  });

  it("鍵の長さがまちまちでも扱える（SHA-256 で畳む）", () => {
    for (const key of ["a", "x".repeat(200), "日本語の鍵"]) {
      const enc = encryptToken(TOKEN, key);
      expect(decryptToken(enc, key)).toBe(TOKEN);
    }
  });
});

describe("BYTEA リテラル", () => {
  it("往復して同じバイト列になる", () => {
    const enc = encryptToken(TOKEN, KEY);
    const literal = toByteaLiteral(enc);
    expect(literal.startsWith("\\x")).toBe(true);
    expect(fromByteaLiteral(literal).equals(enc)).toBe(true);
  });

  it("復号まで通る", () => {
    const literal = toByteaLiteral(encryptToken(TOKEN, KEY));
    expect(decryptToken(fromByteaLiteral(literal), KEY)).toBe(TOKEN);
  });

  it("接頭辞が無い 16 進文字列も読める", () => {
    const enc = encryptToken(TOKEN, KEY);
    expect(fromByteaLiteral(enc.toString("hex")).equals(enc)).toBe(true);
  });
});

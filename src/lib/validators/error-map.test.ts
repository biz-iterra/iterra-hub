import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeZodIssue } from "./error-map";
// 副作用（z.config）の読み込みが目的。**これが無いと素の Zod のまま英語が返る**
import "./common";

/**
 * UT-71: Zod の既定エラー文言が英語のまま出ないこと。
 *
 * 判定の本体（describeZodIssue）は純粋関数なので単体で確かめ、
 * **実際に z.config が効いているか**はスキーマを parse して確かめる。
 * 後者が無いと、関数は正しいのに配線されていない状態を見逃す。
 */

const ASCII_SENTENCE = /^[\x20-\x7E]+$/;

describe("describeZodIssue", () => {
  it("未入力は型の話にしない", () => {
    expect(describeZodIssue({ code: "invalid_type", expected: "string", input: undefined })).toBe(
      "入力してください"
    );
    expect(describeZodIssue({ code: "invalid_type", expected: "string", input: null })).toBe(
      "入力してください"
    );
  });

  it("型違いは期待した型ごとに言い換える", () => {
    expect(describeZodIssue({ code: "invalid_type", expected: "number", input: "a" })).toBe(
      "数値で入力してください"
    );
    expect(describeZodIssue({ code: "invalid_type", expected: "boolean", input: "a" })).toBe(
      "選択してください"
    );
  });

  it("1 文字以上は「入力してください」に寄せる", () => {
    expect(describeZodIssue({ code: "too_small", origin: "string", minimum: 1 })).toBe(
      "入力してください"
    );
  });

  it("下限・上限は対象ごとに助数詞を変える", () => {
    expect(describeZodIssue({ code: "too_small", origin: "string", minimum: 3 })).toBe(
      "3 文字以上で入力してください"
    );
    expect(describeZodIssue({ code: "too_big", origin: "string", maximum: 100 })).toBe(
      "100 文字以内で入力してください"
    );
    expect(describeZodIssue({ code: "too_small", origin: "number", minimum: 0 })).toBe(
      "0 以上の数値を入力してください"
    );
    expect(describeZodIssue({ code: "too_small", origin: "array", minimum: 2 })).toBe(
      "2 件以上選んでください"
    );
  });

  it("境界を含まない指定は言い方を変える", () => {
    expect(
      describeZodIssue({ code: "too_small", origin: "number", minimum: 0, inclusive: false })
    ).toBe("0 より大きい数値を入力してください");
  });

  it("日付は文字数ではなく前後で言う", () => {
    expect(describeZodIssue({ code: "too_small", origin: "date", minimum: 0 })).toBe(
      "指定できる日付より前です"
    );
    expect(describeZodIssue({ code: "too_big", origin: "date", maximum: 0 })).toBe(
      "指定できる日付より後です"
    );
  });

  it("形式ごとに直し方が分かる文言を返す", () => {
    expect(describeZodIssue({ code: "invalid_format", format: "email" })).toBe(
      "メールアドレスの形式で入力してください"
    );
    expect(describeZodIssue({ code: "invalid_format", format: "url" })).toContain("https://");
    expect(describeZodIssue({ code: "invalid_format", format: "uuid" })).toBe(
      "UUID 形式で指定してください"
    );
  });

  it("知らない形式でも英語を返さない", () => {
    expect(describeZodIssue({ code: "invalid_format", format: "cuid2" })).toBe(
      "入力の形式が正しくありません"
    );
  });

  it("custom（refine）は呼び出し側の文言に委ねる", () => {
    expect(describeZodIssue({ code: "custom" })).toBeUndefined();
  });
});

describe("z.config が効いていること", () => {
  it("未入力・文字数・メール・列挙のどれも英語にならない", () => {
    const schema = z.object({
      name: z.string().min(1).max(5),
      email: z.email(),
      kind: z.enum(["a", "b"]),
      count: z.number().min(0),
    });

    const result = schema.safeParse({ name: "", email: "x", kind: "c", count: -1 });
    expect(result.success).toBe(false);

    const messages = result.error!.issues.map((i) => i.message);
    expect(messages.length).toBe(4);
    for (const m of messages) {
      expect(m, `英語のまま出ている: ${m}`).not.toMatch(ASCII_SENTENCE);
    }
  });

  it("スキーマに書いた文言のほうが優先される", () => {
    const schema = z.string().min(1, "事業者名を入力してください");
    const result = schema.safeParse("");
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe("事業者名を入力してください");
  });

  it("未入力（undefined）でも型の話にならない", () => {
    const result = z.object({ name: z.string() }).safeParse({});
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toBe("入力してください");
  });
});

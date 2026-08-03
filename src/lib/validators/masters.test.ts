import { describe, expect, it } from "vitest";
import {
  leadStatusCreateSchema,
  leadStatusUpdateSchema,
  leadStageCreateSchema,
  leadSmallSegmentCreateSchema,
  createAccountStatusSchema,
  createPipelineTypeSchema,
} from "./masters";

/** テスト用の妥当な UUID（Postgres と同じ寛容な形式） */
const STAGE_ID = "c0000000-0000-0000-0000-000000000001";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : result.error!.issues[0].message;
}

describe("leadStatusCreateSchema", () => {
  const valid = {
    stage_id: STAGE_ID,
    code: "no_prospect",
    name: "見込みなし",
    definition: "追客対象から外した状態",
    sort_order: 10,
    color: "#9E9E9E",
  };

  it("必要な項目が揃っていれば通る", () => {
    const result = leadStatusCreateSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  // DB が code NOT NULL のため、ここで止めないと Postgres の生エラーが画面に出る
  it("code が無いと日本語の必須エラーを返す", () => {
    const { code: _code, ...withoutCode } = valid;
    const result = leadStatusCreateSchema.safeParse(withoutCode);
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[code] コードを入力してください");
  });

  it("code が空文字でも必須エラーになる（フォームは空欄を空文字で送る）", () => {
    const result = leadStatusCreateSchema.safeParse({ ...valid, code: "" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[code] コードを入力してください");
  });

  it("code の形式違反は DB の CHECK と同じ条件で弾く", () => {
    for (const code of ["No_Prospect", "1st", "見込みなし", "no-prospect"]) {
      const result = leadStatusCreateSchema.safeParse({ ...valid, code });
      expect(result.success).toBe(false);
      expect(firstMessage(result)).toContain("[code]");
      expect(firstMessage(result)).toContain("半角英小文字");
    }
  });

  it("stage_id は必須（DB が NOT NULL）", () => {
    const result = leadStatusCreateSchema.safeParse({ ...valid, stage_id: null });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[stage_id] リードステージを選択してください");
  });

  it("色は空欄なら NULL に正規化する（既定配色へのフォールバック）", () => {
    const result = leadStatusCreateSchema.safeParse({ ...valid, color: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.color).toBeNull();
  });

  it("色の形式違反は日本語で理由と例を返す", () => {
    const result = leadStatusCreateSchema.safeParse({ ...valid, color: "9E9E9E" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe(
      "[color] バッジ色は # と16進数6桁で入力してください（例: #E53935）"
    );
  });

  it("色は 3 桁表記や rgb() を受け付けない", () => {
    for (const color of ["#FFF", "rgb(255,0,0)", "#GGGGGG"]) {
      expect(leadStatusCreateSchema.safeParse({ ...valid, color }).success).toBe(false);
    }
  });

  // Zod 既定の "Too small: expected number to be >=0" が画面に出ていた
  it("表示順が負数でも英語の既定メッセージを返さない", () => {
    const result = leadStatusCreateSchema.safeParse({ ...valid, sort_order: -1 });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[sort_order] 表示順は0以上の整数で入力してください");
  });

  it("表示順が小数なら整数を促す", () => {
    const result = leadStatusCreateSchema.safeParse({ ...valid, sort_order: 1.5 });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[sort_order] 表示順は整数で入力してください");
  });

  it("表示順が未指定なら 0 を既定にする", () => {
    const { sort_order: _sort, ...withoutSort } = valid;
    const result = leadStatusCreateSchema.safeParse(withoutSort);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sort_order).toBe(0);
  });

  it("名称は 100 文字を超えると弾く（DB の CHECK と同じ上限）", () => {
    const result = leadStatusCreateSchema.safeParse({ ...valid, name: "あ".repeat(101) });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[name] 名称は100文字以内で入力してください");
  });
});

describe("leadStatusUpdateSchema", () => {
  it("一部だけの更新を許す", () => {
    const result = leadStatusUpdateSchema.safeParse({ name: "見込みなし" });
    expect(result.success).toBe(true);
  });

  // 部分更新で sort_order を送っていないのに 0 で上書きされると並び順が壊れる
  it("表示順を送らなければ値を持たない", () => {
    const result = leadStatusUpdateSchema.safeParse({ name: "見込みなし" });
    expect(result.success).toBe(true);
    if (result.success) expect("sort_order" in result.data).toBe(false);
  });

  it("送った値の検証は作成時と同じ", () => {
    const result = leadStatusUpdateSchema.safeParse({ code: "NG" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toContain("[code]");
  });
});

describe("その他マスタの必須カラム", () => {
  it("リードステージは slug が必須", () => {
    const result = leadStageCreateSchema.safeParse({ name: "育成" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[slug] スラッグを入力してください");
  });

  it("小セグメントは大セグメントと code が必須", () => {
    const result = leadSmallSegmentCreateSchema.safeParse({ name: "食品製造" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toContain("[large_segment_id]");
  });

  it("取引先ステータスは code が必須", () => {
    const result = createAccountStatusSchema.safeParse({ name: "取引中" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[code] コードを入力してください");
  });

  it("パイプライン種別は slug が必須", () => {
    const result = createPipelineTypeSchema.safeParse({ name: "通常営業" });
    expect(result.success).toBe(false);
    expect(firstMessage(result)).toBe("[slug] スラッグを入力してください");
  });

  it("パイプライン種別はクローズ既定月数の空欄を NULL にする", () => {
    const result = createPipelineTypeSchema.safeParse({
      slug: "sales",
      name: "通常営業",
      default_close_months: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.default_close_months).toBeNull();
  });
});

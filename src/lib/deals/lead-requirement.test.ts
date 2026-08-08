import { describe, expect, it } from "vitest";
import {
  defaultDealName,
  evaluateLeadForDeal,
  pickRaiseTargetStage,
  type LeadForDeal,
  type LeadStageForDeal,
} from "./lead-requirement";

/**
 * UT-75: 商談を作れるリードかの判定（T-0069 / T-0070）
 *
 * セールスの商談は「商談を起こしてよい段階」（選定 = TQL 以上）のリードから作る。
 * DB のトリガーではなく `create_deal_with_lead` が最終的に強制するが、
 * 画面では**押す前に**知らせたい。判定はここに集約して二重実装しない。
 */

const stage = (
  name: string,
  flags: Partial<LeadStageForDeal> = {}
): LeadStageForDeal => ({
  id: `stage-${name}`,
  name,
  is_deal_ready: false,
  requires_deal: false,
  sort_order: 1,
  ...flags,
});

const lead = (stageValue: LeadForDeal["stage"]): LeadForDeal => ({
  id: "lead-1",
  lead_name: "株式会社サンプル - Web制作の相談",
  stage: stageValue,
  company: null,
  contact: null,
});

describe("evaluateLeadForDeal", () => {
  it("選定（TQL）なら作れる", () => {
    const v = evaluateLeadForDeal(lead({ id: "s", name: "選定", is_deal_ready: true }));
    expect(v.ok).toBe(true);
  });

  it("Sales / Opportunity でも作れる（2 本目以降の商談）", () => {
    for (const name of ["Sales", "Opportunity"]) {
      expect(evaluateLeadForDeal(lead({ id: "s", name, is_deal_ready: true })).ok).toBe(true);
    }
  });

  it("育成・獲得は作れない。ステージを上げれば作れると伝える", () => {
    for (const name of ["育成", "獲得"]) {
      const v = evaluateLeadForDeal(lead({ id: "s", name, is_deal_ready: false }));
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.needsStageRaise).toBe(true);
        expect(v.message).toContain(name);
      }
    }
  });

  it("**Dead も作れない**（終了したリードから商談を起こさない）", () => {
    const v = evaluateLeadForDeal(lead({ id: "s", name: "Dead", is_deal_ready: false }));
    expect(v.ok).toBe(false);
  });

  it("リードが選ばれていなければ、ステージを上げても解決しないと伝える", () => {
    const v = evaluateLeadForDeal(null);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.needsStageRaise).toBe(false);
  });

  it("ステージが取れないときは止めない（RLS で埋まらないことがある。DB 側で弾く）", () => {
    expect(evaluateLeadForDeal(lead(null)).ok).toBe(true);
  });
});

describe("pickRaiseTargetStage", () => {
  const stages = [
    stage("獲得", { sort_order: 1 }),
    stage("育成", { sort_order: 2 }),
    stage("選定", { sort_order: 3, is_deal_ready: true }),
    stage("Sales", { sort_order: 4, is_deal_ready: true, requires_deal: true }),
    stage("Dead", { sort_order: 7 }),
  ];

  it("商談を起こしてよく、まだ商談を前提としない段階（選定）を選ぶ", () => {
    expect(pickRaiseTargetStage(stages)?.name).toBe("選定");
  });

  it("**Sales 以降は選ばない**（商談が無いうちは上げられない）", () => {
    const onlySales = [stage("Sales", { is_deal_ready: true, requires_deal: true })];
    expect(pickRaiseTargetStage(onlySales)).toBeNull();
  });

  it("候補が複数なら sort_order の小さい方", () => {
    const two = [
      stage("後", { sort_order: 5, is_deal_ready: true }),
      stage("先", { sort_order: 3, is_deal_ready: true }),
    ];
    expect(pickRaiseTargetStage(two)?.name).toBe("先");
  });

  it("候補が無ければ null", () => {
    expect(pickRaiseTargetStage([stage("獲得")])).toBeNull();
  });
});

describe("defaultDealName", () => {
  it("昇格と同じ形にする（入口が違っても名前が揃う）", () => {
    expect(defaultDealName("株式会社サンプル")).toBe("株式会社サンプル 案件");
  });

  it("前後の空白は落とす", () => {
    expect(defaultDealName("  A社  ")).toBe("A社 案件");
  });

  it("空なら空（勝手に「案件」だけの名前にしない）", () => {
    expect(defaultDealName("   ")).toBe("");
  });
});

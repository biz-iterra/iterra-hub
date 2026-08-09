/**
 * ディールを作れるリードかの判定（T-0069 / T-0070）。
 *
 * **セールスのディールには元になったリードが必要**で、そのリードは
 * ディールを起こしてよい段階（`lead_stages.is_deal_ready` = リード選定 = TQL 以上）に
 * いなければならない。DB のトリガー `check_deal_lead_requirement` が
 * 最終的に強制するが、画面では**押す前に**知らせたい。
 *
 * ここは判定だけを持つ純粋関数。UI と Server Action の両方から使い、
 * 同じ規則を二重に書かない。
 */

export type LeadStageForDeal = {
  id: string;
  name: string;
  /** ディールを起こしてよい段階か（リード選定 = TQL 以上） */
  is_deal_ready: boolean;
  /** ディールが既にあることを前提とする段階か（ディール 以降） */
  requires_deal: boolean;
  sort_order: number;
};

export type LeadForDeal = {
  id: string;
  lead_name: string;
  stage: Pick<LeadStageForDeal, "id" | "name" | "is_deal_ready"> | null;
  company: { id: string; name: string } | null;
  contact: { id: string; label: string } | null;
};

export type LeadForDealVerdict =
  /** そのままディールを作れる */
  | { ok: true }
  /** ステージを上げれば作れる */
  | { ok: false; needsStageRaise: true; message: string }
  /** 上げても作れない（リードが選ばれていない等） */
  | { ok: false; needsStageRaise: false; message: string };

/**
 * そのリードでディールを作れるか。
 *
 * ステージが未取得（`null`）のときは**作れない扱いにしない**。
 * 参照権限の都合で埋まらないことがあり、そこで止めると
 * 画面が理由の分からない行き止まりになる。DB 側で弾かれる。
 */
export function evaluateLeadForDeal(
  lead: LeadForDeal | null
): LeadForDealVerdict {
  if (!lead) {
    return {
      ok: false,
      needsStageRaise: false,
      message: "リードを選んでください",
    };
  }

  if (!lead.stage) return { ok: true };

  if (!lead.stage.is_deal_ready) {
    return {
      ok: false,
      needsStageRaise: true,
      // **上げ先の名前をここに書かない。** ステージ名は管理画面で変えられる。
      // 呼び出し側が `pickRaiseTargetStage()` の結果を続けて出す
      message: `このリードは「${lead.stage.name}」段階です。ディールを作るには段階を進めます。`,
    };
  }

  return { ok: true };
}

/**
 * ステージを上げる先。
 *
 * **ディールを起こしてよくて、まだディールを前提としない段階**（= リード選定）を選ぶ。
 * ディール以降は「ディールがあること」を要求するので、ディールを作る前には上げられない
 * （`check_lead_stage_requirements` に弾かれる）。
 */
export function pickRaiseTargetStage(
  stages: readonly LeadStageForDeal[]
): LeadStageForDeal | null {
  const candidates = stages
    .filter((s) => s.is_deal_ready && !s.requires_deal)
    .sort((a, b) => a.sort_order - b.sort_order);
  return candidates[0] ?? null;
}

/**
 * ディール名の既定値。
 *
 * リードから昇格したときと同じ形にする（`promoteLeadToDeal` が
 * `${lead_name} 案件` を組み立てている）。入口が違っても名前が揃うように。
 */
export function defaultDealName(leadName: string): string {
  const trimmed = leadName.trim();
  return trimmed ? `${trimmed} 案件` : "";
}

/**
 * 会社名の表記を整える。
 *
 * 名刺や CSV の会社名は「㈱」「（株）」「株式会社」が混在する。表記が違うだけで
 * 別の法人として登録されてしまうため、**保存する値そのもの**を正式表記に寄せる。
 *
 * 名寄せキーを作る `normalizeCompanyName`（houjin-bangou/match.ts）とは役割が違う。
 * あちらは比較のために法人格を落とす。こちらは法人格を正式な綴りに直して残す。
 *
 * **DB 関数 `expand_corporate_abbreviations`（20260802000003）と同じ規則。**
 * 画面からの保存は TS 側、名刺取込は DB 側を通るため両方に同じ規則が要る。
 * 片方だけ変えると経路によって保存される名前がずれるので、必ず両方を直すこと。
 */

/**
 * 略記と正式表記の対応。
 *
 * 括弧付きの略記は全角・半角の両方が実データに出てくる。
 * **上から順に当てるので、複合した略記を単独より先に置く**
 * （「(一般㈶)」を「㈶」より先に処理しないと「(一般財団法人)」になる）。
 *
 * `㈶` `㈳` は旧制度の「財団法人」「社団法人」。現行の一般/公益への
 * 移行前の名称がそのまま残っている事業者があるため、そのまま開く。
 */
const CORPORATE_ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/㈱|\(株\)|（株）/g, "株式会社"],
  [/㈲|\(有\)|（有）/g, "有限会社"],
  [/\(同\)|（同）/g, "合同会社"],
  [/㈾|\(資\)|（資）/g, "合資会社"],
  [/㈴|\(名\)|（名）/g, "合名会社"],
  // 実データにある「(一般㈶)」「(公益㈶)」。単独の ㈶ / ㈳ より先に当てる
  [/[（(]一般㈶[)）]/g, "一般財団法人"],
  [/[（(]公益㈶[)）]/g, "公益財団法人"],
  [/[（(]一般㈳[)）]/g, "一般社団法人"],
  [/[（(]公益㈳[)）]/g, "公益社団法人"],
  [/\(一社\)|（一社）/g, "一般社団法人"],
  [/\(一財\)|（一財）/g, "一般財団法人"],
  [/\(公社\)|（公社）/g, "公益社団法人"],
  [/\(公財\)|（公財）/g, "公益財団法人"],
  [/\(特非\)|（特非）/g, "特定非営利活動法人"],
  [/\(医\)|（医）/g, "医療法人"],
  [/㈻|\(学\)|（学）/g, "学校法人"],
  [/\(福\)|（福）/g, "社会福祉法人"],
  [/\(宗\)|（宗）/g, "宗教法人"],
  [/㈶|\(財\)|（財）/g, "財団法人"],
  [/㈳|\(社\)|（社）/g, "社団法人"],
];

/** 略記を正式表記に開く。「㈱テスト」→「株式会社テスト」、「テスト㈱」→「テスト株式会社」 */
export function expandCorporateAbbreviations(
  name: string | null | undefined
): string {
  if (!name) return "";
  let result = name;
  for (const [pattern, full] of CORPORATE_ABBREVIATIONS) {
    result = result.replace(pattern, full);
  }
  return result;
}

/**
 * 保存する会社名を整える。略記の展開に加えて空白を詰める。
 * 全角スペースは半角に寄せ、連続する空白は 1 つにする。
 */
export function formatCompanyName(name: string | null | undefined): string {
  if (!name) return "";
  return expandCorporateAbbreviations(name.replace(/　/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 会社名から法人格を判定する。
 *
 * 名称に法人格の綴りがそのまま含まれていれば、それを法人格とみなす。
 * 「一般社団法人」と「社団法人」の両方がマスタにある場合に短い方が先に
 * 当たらないよう、長い綴りから順に探す。
 *
 * 判定できない（「個人事業主」のように名称へ現れない）ものは null を返す。
 * 呼び出し側で人が選んだ値を上書きしないこと。
 */
export function detectCorporateType<T extends { id: string; name: string }>(
  companyName: string | null | undefined,
  types: readonly T[]
): T | null {
  const name = formatCompanyName(companyName);
  if (!name) return null;

  const byLongestSpelling = [...types].sort(
    (a, b) => (b.name?.length ?? 0) - (a.name?.length ?? 0)
  );
  return byLongestSpelling.find((t) => t.name && name.includes(t.name)) ?? null;
}

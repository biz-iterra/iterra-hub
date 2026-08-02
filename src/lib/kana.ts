/**
 * 名称の読み（フリガナ）を作る。
 *
 * 形態素解析（kuromoji / IPADIC）で漢字の読みを引く。
 *
 * **読みは正確とは限らない。** 社名は地名・人名・造語が多く、辞書の読みが
 * 実際の読みと食い違うことがある（「味生」を「アジセイ」と読むなど）。
 * それでも空欄のままより手掛かりがある方が一覧で探しやすいので、
 * 「あとから人が直せる下書き」として入れる。人が入れた値は上書きしない。
 *
 * 辞書に無い語（英字・記号）は表記のまま残す。英字社名は読み下すより
 * 綴りのままの方が探しやすい。
 *
 * 辞書は 17MB あるためサーバー側でのみ読む。**クライアントから import しないこと。**
 * プロセスにつき 1 回だけロードして使い回す。
 */

import path from "node:path";

import kuromoji from "kuromoji";
import type { IpadicFeatures, Tokenizer } from "kuromoji";

/**
 * 辞書の置き場所。
 *
 * dev も standalone も実行ディレクトリ直下に node_modules があるため
 * cwd から辿れる。`require.resolve` は使えない —— Turbopack が
 * バンドル時に静的解決してモジュール ID（数値）へ置き換えてしまう。
 *
 * 配置が変わる環境では KUROMOJI_DIC_PATH で上書きできる。
 */
const DIC_PATH =
  process.env.KUROMOJI_DIC_PATH ??
  path.join(process.cwd(), "node_modules", "kuromoji", "dict");

/** ロードは数百 ms かかる。並行して呼ばれても 1 回で済むよう Promise を保持する */
let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;

function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: DIC_PATH }).build((err, tokenizer) => {
        if (err) {
          // 次の呼び出しでやり直せるようにする（辞書の配置漏れなど）
          tokenizerPromise = null;
          reject(err);
          return;
        }
        resolve(tokenizer);
      });
    });
  }
  return tokenizerPromise;
}

/**
 * カタカナの読みを返す。読みが引けない語は表記のまま残す。
 * 解析に失敗したときは空文字を返す（フリガナは無くても業務は回る）。
 */
export async function toKatakanaReading(
  text: string | null | undefined
): Promise<string> {
  const source = (text ?? "").trim();
  if (!source) return "";

  try {
    const tokenizer = await getTokenizer();
    return tokenizer
      .tokenize(source)
      .map((token) => {
        // 未知語は reading を持たない。kuromoji は '*' を返すこともある
        const reading = token.reading;
        return reading && reading !== "*" ? reading : token.surface_form;
      })
      .join("")
      .trim();
  } catch {
    return "";
  }
}

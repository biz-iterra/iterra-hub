/**
 * SNS・チャットの連絡口から、相手ひとりとのやり取りを開く URL を作る。
 *
 * 雛形はマスタ（`social_services.dm_url_template`）が持ち、ここは差し替えだけを
 * 引き受ける。サービスが増えても admin がマスタに 1 行足せば動く。
 */

export type SocialServiceTemplate = {
  dm_url_template: string | null;
  requires_workspace: boolean;
};

export type SocialAccountValues = {
  account_id: string;
  workspace?: string | null;
};

/**
 * 「その他」に URL をそのまま入れる使い方では encodeURIComponent が邪魔になる
 * （`https://example.com/a?b=c` の `:` や `/` まで潰れる）。雛形が
 * `{account_id}` だけのときは素通しする。
 */
export function isPassthroughTemplate(template: string | null | undefined): boolean {
  return template?.trim() === "{account_id}";
}

/** 差し替えできる印。増やすときは buildSocialDmUrl と対で直す */
const PLACEHOLDERS = ["account_id", "workspace"] as const;

/**
 * 開ける URL を組み立てる。開けないときは null。
 *
 * null になるのは次のいずれか:
 *   - マスタに雛形が無い
 *   - 必要な値が埋まっていない（Slack のワークスペースなど）
 *   - 組み立てた結果が http(s) にならない（「その他」に URL 以外を入れた場合）
 */
export function buildSocialDmUrl(
  service: SocialServiceTemplate,
  values: SocialAccountValues
): string | null {
  const template = service.dm_url_template?.trim();
  if (!template) return null;

  const accountId = values.account_id?.trim();
  if (!accountId) return null;

  const workspace = values.workspace?.trim() ?? "";
  if (service.requires_workspace && !workspace) return null;

  // 雛形が求めている値が空なら、壊れた URL を作らずに諦める
  if (template.includes("{workspace}") && !workspace) return null;

  // 「その他」は入れた値がそのまま URL。encodeURIComponent を通すと
  // `://` や `?` まで潰れてしまうので素通しする
  const filled = isPassthroughTemplate(template)
    ? accountId
    : PLACEHOLDERS.reduce((url, key) => {
        const value = key === "account_id" ? accountId : workspace;
        return url.split(`{${key}}`).join(encodeURIComponent(value));
      }, template);

  // javascript: のような危ない値を開かないよう、ここで形を確かめる
  try {
    const parsed = new URL(filled);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

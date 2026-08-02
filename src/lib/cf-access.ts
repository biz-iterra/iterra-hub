/**
 * Cloudflare Access の認証を引き継ぐ。
 *
 * 本番は Cloudflare Access（@iterra.jp のメール OTP）を前置してから
 * アプリのログインを求めていた。同じ人に 2 回名乗らせることになるので、
 * Access を通っていればアプリのセッションも張る。
 *
 * Access は認証済みリクエストに `Cf-Access-Jwt-Assertion` ヘッダーを付ける。
 * **ヘッダーの存在だけで信用しない。** 署名・発行元・宛先（AUD）まで検かめる。
 * アプリは cloudflared からしか到達できない構成だが、経路の前提が変わっても
 * 破れないようにしておく。
 *
 * 未設定（ローカル開発など）では null を返し、従来のログイン画面に落ちる。
 * 設計: docs/deployment-nas.md § 3
 */

import { createRemoteJWKSet, jwtVerify } from "jose";

/** Access が認証済みリクエストに付けるヘッダー */
export const CF_ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

/** middleware がセッション発行へ回すときの行き先 */
export const CF_ACCESS_CALLBACK_PATH = "/auth/cf-access";

export type CfAccessConfig = {
  /** 例: iterra.cloudflareaccess.com */
  teamDomain: string;
  /** Access アプリケーションの Application Audience (AUD) タグ */
  aud: string;
};

export function getCfAccessConfig(): CfAccessConfig | null {
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const aud = process.env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !aud) return null;

  return {
    // https:// を付けて設定されても動くようにする
    teamDomain: teamDomain.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    aud,
  };
}

/**
 * 公開鍵は Cloudflare が持ち回すので、取得したものを使い回す
 * （jose 側が期限を見て取り直す）。
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`)
    );
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Access の JWT を検証し、認証された人のメールアドレスを返す。
 * 検証できないときは null（理由は返さない。呼び出し側は一律でログイン画面へ）。
 */
export async function verifyCfAccessJwt(
  token: string | null | undefined
): Promise<string | null> {
  const config = getCfAccessConfig();
  if (!config || !token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(config.teamDomain), {
      issuer: `https://${config.teamDomain}`,
      audience: config.aud,
    });

    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    return email ? email.toLowerCase() : null;
  } catch {
    // 期限切れ・宛先違い・署名不一致はすべて「通さない」で足りる
    return null;
  }
}

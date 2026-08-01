/**
 * 外部へ渡す URL のオリジン。
 *
 * リバースプロキシ（Cloudflare Tunnel）配下では、リクエストから公開 URL を
 * 復元できない。standalone の Next は Host ヘッダを信用せず、サーバーの
 * `HOSTNAME`（Docker では `0.0.0.0`）で絶対 URL を組むため、
 * `request.nextUrl.origin` は `https://0.0.0.0` になる。
 *
 * 画面内のリダイレクトは Next が相対 URL に畳むので実害が出ないが、
 * OAuth の `redirect_uri` のように**相手方へ渡す URL** はこれでは通らない
 * （Google は IP アドレスのリダイレクト先を拒否する。実際に
 * `invalid_request` で連携できなかった。docs/deployment-nas.md § 9）。
 *
 * そのため公開 URL は `APP_ORIGIN` で明示する。開発機は直アクセスで
 * リクエスト由来の値が正しいため、未設定でも動く。
 */

/** 待ち受け専用のアドレス。外から辿り着けない */
const UNREACHABLE_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

/** `APP_ORIGIN` の設定値。未設定なら null */
export function getConfiguredOrigin(): string | null {
  const value = process.env.APP_ORIGIN;
  if (!value?.trim()) return null;
  return normalize(value);
}

/** 外部へ渡しても辿り着ける形か */
export function isReachableOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    return !UNREACHABLE_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

/**
 * 外部へ渡せるオリジンを返す。`APP_ORIGIN` があればそれを、無ければ
 * リクエスト由来の値で代替する。どちらも使えなければ null を返すので、
 * 呼び出し側は設定漏れとして利用者に見える形で知らせること。
 */
export function resolveExternalOrigin(requestOrigin: string): string | null {
  const configured = getConfiguredOrigin();
  if (configured) return isReachableOrigin(configured) ? configured : null;

  const normalized = normalize(requestOrigin);
  return isReachableOrigin(normalized) ? normalized : null;
}

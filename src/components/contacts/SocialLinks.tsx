import type { CSSProperties } from "react";

import type {
  ContactSocialAccount,
  SocialService,
} from "@/actions/contact-social-accounts";
import { buildSocialDmUrl } from "@/lib/social-links";

/**
 * 連絡先が持つ SNS・チャットの連絡口。
 *
 * **使えるサービスを全部並べる。** 登録があるものはサービスの色で、無いものは
 * 灰色で出す。誰にどの手段で連絡できるかが、開いた瞬間に分かるようにするため。
 *
 * 色付きは相手ひとりとのやり取りを直接開く。ID はあるが URL を組み立てられない
 * とき（Slack のワークスペースが空、など）は色付きのまま押せない状態にする。
 */

const badgeBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.75rem",
  height: "1.75rem",
  padding: "0 0.375rem",
  borderRadius: "9999px",
  fontSize: "0.6875rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  textDecoration: "none",
  border: "1px solid transparent",
};

function badgeStyle(color: string, active: boolean, openable: boolean): CSSProperties {
  if (!active) {
    return {
      ...badgeBase,
      backgroundColor: "var(--color-sumi100)",
      color: "var(--color-sumi400)",
      borderColor: "var(--color-border-default)",
    };
  }
  return {
    ...badgeBase,
    backgroundColor: color,
    color: "#fff",
    // 開けない（ID はあるが URL にできない）ものは、色は残しつつ薄くする
    opacity: openable ? 1 : 0.55,
  };
}

export function SocialLinks({
  services,
  accounts,
}: {
  /** 並べる全サービス。登録が無いものも灰色で出す */
  services: SocialService[];
  accounts: ContactSocialAccount[];
}) {
  if (services.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
      {services.map((service) => {
        const linked = accounts.filter((a) => a.service_id === service.id);

        if (linked.length === 0) {
          return (
            <span
              key={service.id}
              style={badgeStyle(service.color, false, false)}
              title={`${service.name}: 未設定`}
              aria-label={`${service.name} 未設定`}
            >
              {service.short_label}
            </span>
          );
        }

        // 同じサービスに複数あるときは、それぞれ別のバッジで出す
        return linked.map((account) => {
          const url = buildSocialDmUrl(service, account);
          const label = account.display_name
            ? `${service.name}（${account.display_name}）`
            : service.name;

          if (!url) {
            return (
              <span
                key={account.id}
                style={badgeStyle(service.color, true, false)}
                title={`${label}: ${account.account_id}（開けません。${
                  service.requires_workspace ? "ワークスペースが未入力です" : "URL を組み立てられません"
                }）`}
              >
                {service.short_label}
              </span>
            );
          }

          return (
            <a
              key={account.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={badgeStyle(service.color, true, true)}
              title={`${label}: ${account.account_id}`}
            >
              {service.short_label}
            </a>
          );
        });
      })}
    </div>
  );
}

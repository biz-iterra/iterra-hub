import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMergeCandidates } from "@/actions/contact-merge";
import { detailContainerClass } from "@/lib/layout";
import { DetectAllButton, MergeCandidatesView } from "./merge-candidates-view";

/**
 * 連絡先の統合候補。
 *
 * 名刺取込で「姓名は一致するが会社が違う」組が見つかると、別人として取り込んだ上で
 * ここに挙がる。同一人物（転職）か同姓同名の別人かを人が判断する。
 * 自動で統合しないのは、誤統合を元に戻せないため（docs/contact-identity.md § 4）。
 */
export default async function MergeCandidatesPage() {
  const { data, error } = await getMergeCandidates("pending");

  return (
    <div className={detailContainerClass}>
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/contacts"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            color: "var(--color-sumi600)",
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} />
          連絡先
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            margin: "0.5rem 0 0.375rem 0",
          }}
        >
          <h1
            style={{
              color: "var(--color-text-title)",
              fontSize: "1.5rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            統合候補
          </h1>
          <DetectAllButton />
        </div>
        <p
          style={{
            color: "var(--color-sumi600)",
            fontSize: "0.875rem",
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          姓名が一致し、所属先が違う連絡先です。転職した同じ人か、同姓同名の別人かを
          確認してください。統合すると元に戻せません。
        </p>
      </div>

      {error ? (
        <p style={{ color: "var(--color-error)", fontSize: "0.875rem" }}>{error}</p>
      ) : (
        <MergeCandidatesView candidates={data ?? []} />
      )}
    </div>
  );
}

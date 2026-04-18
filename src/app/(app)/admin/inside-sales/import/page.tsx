import Link from "next/link";
import { getCurrentUser } from "@/actions/users";
import { ImportView } from "./import-view";

export default async function InsideSalesImportPage() {
  const meResult = await getCurrentUser();

  if (meResult.data?.role !== "admin") {
    return (
      <div style={{ padding: "2rem" }}>
        <p style={{ color: "var(--color-text-body)", marginBottom: "1rem" }}>
          管理者権限が必要です
        </p>
        <Link
          href="/dashboard"
          className="hover:bg-[var(--color-bg-hover)]"
          style={{
            color: "var(--color-terra)",
            textDecoration: "none",
            padding: "0.125rem 0.375rem",
            margin: "-0.125rem -0.375rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          ダッシュボードへ戻る
        </Link>
      </div>
    );
  }

  return <ImportView currentUserId={meResult.data.id} />;
}

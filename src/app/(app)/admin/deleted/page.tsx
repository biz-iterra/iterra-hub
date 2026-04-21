import Link from "next/link";
import { getCurrentUser, getCrmUsers } from "@/actions/users";
import { getDeletedCounts } from "@/actions/deleted";
import { DeletedView } from "./deleted-view";

export default async function DeletedPage() {
  const [meResult, usersResult, countsResult] = await Promise.all([
    getCurrentUser(),
    getCrmUsers(),
    getDeletedCounts(),
  ]);

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

  const userMap = Object.fromEntries(
    (usersResult.data ?? []).map((u) => [u.id, u.full_name])
  );

  return (
    <DeletedView
      userMap={userMap}
      initialCounts={
        countsResult.data ?? {
          companies: 0,
          accounts: 0,
          contacts: 0,
          deals: 0,
          contracts: 0,
          talents: 0,
          leads: 0,
        }
      }
    />
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const pathLabels: Record<string, string> = {
  "/dashboard": "ダッシュボード",
  "/deals": "ディール",
  "/contacts": "コンタクト",
  "/companies": "カンパニー",
  "/accounts": "アカウント",
  "/contracts": "契約",
  "/talents": "タレント",
  "/projects": "プロジェクト",
  "/admin": "管理",
  "/admin/deleted": "削除済みレコード",
  "/admin/inside-sales": "インサイドセールス",
  "/admin/inside-sales/import": "CSV取込",
};

// パスセグメントの変換辞書（末尾 / 中間両方で使用）
const segmentLabels: Record<string, string> = {
  new: "新規作成",
  edit: "編集",
  deleted: "削除済み",
  import: "CSV取込",
  "inside-sales": "インサイドセールス",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getBreadcrumb(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const items: { label: string; href: string }[] = [];

  let currentPath = "";
  for (const segment of segments) {
    currentPath += `/${segment}`;
    let label: string;
    if (pathLabels[currentPath]) {
      label = pathLabels[currentPath];
    } else if (UUID_REGEX.test(segment)) {
      label = "詳細";
    } else if (segmentLabels[segment]) {
      label = segmentLabels[segment];
    } else {
      label = segment;
    }
    items.push({ label, href: currentPath });
  }

  return items;
}

export function Header({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const breadcrumb = getBreadcrumb(pathname);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header
      className="flex items-center justify-between h-14 px-6 shrink-0"
      style={{
        backgroundColor: "#fff",
        borderBottom: "1px solid var(--color-border-default)",
      }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm">
        {breadcrumb.map((item, i) => (
          <span key={item.href} className="flex items-center gap-1.5">
            {i > 0 && (
              <span style={{ color: "var(--color-sumi400)" }}>/</span>
            )}
            <span
              style={{
                color:
                  i === breadcrumb.length - 1
                    ? "var(--color-text-title)"
                    : "var(--color-text-list)",
                fontWeight: i === breadcrumb.length - 1 ? 600 : 400,
              }}
            >
              {item.label}
            </span>
          </span>
        ))}
      </nav>

      {/* User menu */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <User size={18} style={{ color: "var(--color-sumi500)" }} />
          <span
            className="text-sm"
            style={{ color: "var(--color-text-list)" }}
          >
            {userName || "ユーザー"}
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm cursor-pointer transition-colors px-3 py-1.5"
          style={{
            color: "var(--color-sumi600)",
            borderRadius: "var(--radius-button)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <LogOut size={16} />
          <span>ログアウト</span>
        </button>
      </div>
    </header>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, ChevronDown, LogOut, User, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GlobalSearch } from "./global-search";

const pathLabels: Record<string, string> = {
  "/dashboard": "ダッシュボード",
  "/activities": "アクティビティ",
  "/leads": "リード",
  "/progress/inquiry": "問い合わせ進捗",
  "/progress/inbound": "インバウンド進捗",
  "/progress/outbound": "アウトバウンド進捗",
  "/campaigns": "キャンペーン",
  "/deals": "商談",
  "/contacts": "連絡先",
  "/contacts/candidates": "連絡先の候補",
  "/companies": "事業者情報",
  "/accounts": "取引先",
  "/contracts": "契約",
  "/talents": "タレント",
  "/projects": "プロジェクト",
  // サイドバーと画面内の戻りリンクは「マスタ・取込」。パンくずだけ「管理」だった
  "/admin": "マスタ・取込",
  "/admin/deleted": "削除済みレコード",
  "/admin/members": "社内メンバー",
  "/profile": "プロフィール設定",
};

// パスセグメントの変換辞書（末尾 / 中間両方で使用）
const segmentLabels: Record<string, string> = {
  new: "新規作成",
  edit: "編集",
  deleted: "削除済み",
  candidates: "連絡先の候補",
  "merge-candidates": "統合候補",
  cards: "名刺",
  // /progress 単体のページは無いが、中間セグメントとして出る
  progress: "進捗管理",
  import: "取込",
  // /admin/leads/import の中間セグメント。単体のページは無いが英語のまま出ていた
  leads: "リード",
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const closeMenu = (opts?: { restoreFocus?: boolean }) => {
    setMenuOpen(false);
    if (opts?.restoreFocus) triggerRef.current?.focus();
  };

  // 開いたら先頭のメニュー項目へフォーカスを移す
  useEffect(() => {
    if (menuOpen) {
      itemRefs.current[0]?.focus();
    }
  }, [menuOpen]);

  // 外側クリックでユーザーメニューを閉じる（Esc はメニュー内の keydown ハンドラで処理）
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuOpen]);

  // メニュー内での ↑↓ 移動 / Esc でのクローズ + トリガーへのフォーカス復帰
  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((el): el is HTMLElement => el !== null);
    if (items.length === 0) return;
    const currentIndex = items.findIndex((el) => el === document.activeElement);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = items[(currentIndex + 1 + items.length) % items.length];
      next.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu({ restoreFocus: true });
    } else if (e.key === "Tab") {
      // メニュー外へフォーカスが抜ける前に閉じる
      closeMenu();
    }
  };

  return (
    <header
      className="flex items-center h-14 px-6 shrink-0"
      style={{
        backgroundColor: "#fff",
        borderBottom: "1px solid var(--color-border-default)",
      }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm flex-shrink-0">
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

      {/* 横断検索 */}
      <div className="flex-1 flex justify-center px-4">
        <GlobalSearch />
      </div>

      {/* User menu */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href="/manual"
          title="マニュアル"
          aria-label="マニュアル"
          className="flex items-center justify-center flex-shrink-0 transition-colors"
          style={{
            width: "2rem",
            height: "2rem",
            color: "var(--color-sumi600)",
            borderRadius: "var(--radius-button)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "var(--color-bg-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
          }}
        >
          <BookOpen size={18} />
        </Link>

        <div ref={menuRef} className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="user-menu-dropdown"
            className="flex items-center gap-2 cursor-pointer transition-colors"
            style={{
              padding: "0.375rem 0.625rem",
              borderRadius: "var(--radius-button)",
              backgroundColor: menuOpen ? "var(--color-bg-hover)" : "transparent",
              border: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <User size={18} style={{ color: "var(--color-sumi500)" }} />
            <span
              className="text-sm"
              style={{ color: "var(--color-text-list)" }}
            >
              {userName || "ユーザー"}
            </span>
            <ChevronDown
              size={14}
              style={{
                color: "var(--color-sumi400)",
                transform: menuOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.15s",
              }}
            />
          </button>

          {menuOpen && (
            <div
              id="user-menu-dropdown"
              role="menu"
              aria-label="ユーザーメニュー"
              className="absolute right-0"
              onKeyDown={handleMenuKeyDown}
              style={{
                top: "calc(100% + 0.375rem)",
                minWidth: "12rem",
                backgroundColor: "#fff",
                border: "1px solid var(--color-border-default)",
                borderRadius: "var(--radius-panel)",
                boxShadow: "var(--elevation-high)",
                padding: "0.375rem",
                zIndex: 50,
              }}
            >
              <Link
                ref={(el) => {
                  itemRefs.current[0] = el;
                }}
                href="/profile"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 text-sm transition-colors"
                style={{
                  padding: "0.5rem 0.625rem",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text-body)",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <UserCog size={15} />
                プロフィール設定
              </Link>
              <button
                ref={(el) => {
                  itemRefs.current[1] = el;
                }}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                className="flex items-center gap-2 text-sm cursor-pointer transition-colors w-full"
                style={{
                  padding: "0.5rem 0.625rem",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-text-body)",
                  border: "none",
                  background: "none",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <LogOut size={15} />
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

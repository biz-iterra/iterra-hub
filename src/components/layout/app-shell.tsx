"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import type { CrmUserRole } from "@/types/enums";

/**
 * 画面の外枠。
 *
 * lg 未満ではサイドバーをドロワーにするため、開閉状態をヘッダー（ハンバーガー）と
 * サイドバーの両方から触る必要がある。状態をここで持ち、両者に配る。
 *
 * layout.tsx は Server Component のままにしたいので、
 * ユーザー情報は props で受け取る。
 */
export function AppShell({
  userRole,
  userName,
  children,
}: {
  userRole: CrmUserRole;
  userName?: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // 遷移したら閉じる。ドロワーが開いたまま画面だけ変わると、
  // 何を見ているのか分からなくなる。
  // effect ではなくレンダー中に畳むのは、閉じる前の状態を一瞬描かないため
  // （React の「props が変わったら state を直す」パターン）
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setNavOpen(false);
  }

  // 開いている間は背面をスクロールさせない
  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  // Esc で閉じる
  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userRole={userRole} navOpen={navOpen} onClose={() => setNavOpen(false)} />

      {/* ドロワーの背面。lg 以上ではサイドバーが常設なので出さない */}
      {navOpen && (
        <div
          className="fixed inset-0 lg:hidden"
          style={{
            backgroundColor: "var(--color-overlay)",
            zIndex: "var(--zindex-sticky)",
          }}
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        <Header userName={userName} onMenuClick={() => setNavOpen(true)} navOpen={navOpen} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

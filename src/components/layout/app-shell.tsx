"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { useScrollLock } from "@/hooks/useScrollLock";
import { APP_SCROLLER_ID } from "@/lib/app-scroll";
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

  // 開いている間は背面をスクロールさせない。
  // **body ではなく <main> を止める**（スクローラが body ではないため）
  useScrollLock(navOpen);

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
        {/*
          **relative は必須。外すと画面がスクロールごと崩れる。**

          Tailwind の `.sr-only` をはじめ、画面内には `position: absolute` の
          要素がある。ここが非配置だと、それらの包含ブロックが初期包含ブロック
          （`<html>`）になり、この `overflow-y: auto` にクリップされない。
          結果、表示領域より下にある `sr-only` が `<html>` のスクロール領域を
          押し広げ、`h-screen overflow-hidden` のはずの外枠ごと文書がスクロール
          して、サイドバーとヘッダーが画面外へ出る（T-0089。本番の
          アクティビティ一覧で 782px ずれていた）。

          縦にスクロールするのはこの要素だけ。`window.scrollTo()` は効かない。
          先頭へ戻す・背面を止める操作は `src/lib/app-scroll.ts` を通すこと。
        */}
        <main
          id={APP_SCROLLER_ID}
          className="relative flex-1 overflow-y-auto p-4 sm:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

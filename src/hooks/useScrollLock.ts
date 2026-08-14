"use client";

import { useEffect } from "react";
import { getAppScroller } from "@/lib/app-scroll";

/**
 * モーダル・ドロワーを開いている間、背面のスクロールを止める。
 *
 * **`document.body.style.overflow = "hidden"` では止まらない。**
 * スクロールしているのは body ではなく `<main>`（`src/lib/app-scroll.ts`）。
 * body に書いても何も起きないため、以前は開いたまま背面の一覧が動いていた。
 *
 * スクロールバーはシステム全体で非表示にしてあるので、止めても
 * 幅が変わって中身がずれることはない。
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const scroller = getAppScroller();
    if (!scroller) return;
    const previous = scroller.style.overflow;
    scroller.style.overflow = "hidden";
    return () => {
      scroller.style.overflow = previous;
    };
  }, [active]);
}

// useSheetScrollLock — iOS WKWebView：模态层打开时彻底隔离底层滚动。
// 策略：锁 html/body + 冻结底层可滚节点 + 非 passive 拦截窗外/边缘 touchmove。
// 仅靠 overscroll-behavior 在 WKWebView 上不可靠。

import { useEffect, type RefObject } from "react";

export function isInsideScrollPane(
  node: EventTarget | null,
  root: Element | null,
): boolean {
  if (!(node instanceof Node) || !root) return false;
  return root === node || root.contains(node);
}

/**
 * Whether this touchmove should be cancelled so it cannot chain into
 * layers under a modal sheet.
 */
export function shouldBlockSheetTouchMove(input: {
  target: EventTarget | null;
  scrollEl: HTMLElement | null;
  startY: number;
  clientY: number;
}): boolean {
  const { target, scrollEl, startY, clientY } = input;
  if (!isInsideScrollPane(target, scrollEl) || !scrollEl) return true;

  const dy = clientY - startY;
  const top = scrollEl.scrollTop;
  const max = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
  const atTop = top <= 0;
  const atBottom = top >= max - 1;
  if ((atTop && dy > 0) || (atBottom && dy < 0)) return true;
  return false;
}

const FROZEN_SCROLL_SELECTOR = [
  ".lyra-mobile-history__pages",
  ".lyra-mobile-history__list",
  ".lyra-mobile-history__sheet",
].join(",");

type FreezeRecord = {
  el: HTMLElement;
  overflow: string;
  overflowX: string;
  overflowY: string;
  touchAction: string;
};

/**
 * While `locked` is true:
 * - lock html/body scroll
 * - freeze known underlying scroll hosts (History pager/list)
 * - block document touchmove outside `scrollRef` / at scroll edges
 */
export function useSheetScrollLock(
  locked: boolean,
  scrollRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!locked) return;

    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };

    // iOS: position fixed on body is the most reliable scroll kill-switch.
    const scrollY = window.scrollY || html.scrollTop || 0;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";

    const frozen: FreezeRecord[] = [];
    for (const el of document.querySelectorAll(FROZEN_SCROLL_SELECTOR)) {
      if (!(el instanceof HTMLElement)) continue;
      frozen.push({
        el,
        overflow: el.style.overflow,
        overflowX: el.style.overflowX,
        overflowY: el.style.overflowY,
        touchAction: el.style.touchAction,
      });
      el.style.overflow = "hidden";
      el.style.overflowX = "hidden";
      el.style.overflowY = "hidden";
      el.style.touchAction = "none";
    }

    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const block = shouldBlockSheetTouchMove({
        target: e.target,
        scrollEl: scrollRef.current,
        startY,
        clientY: e.touches[0].clientY,
      });
      if (block) {
        e.preventDefault();
      }
      // Always stop bubbling so History drag / pager never see the gesture.
      e.stopPropagation();
    };

    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: false,
    });

    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      try {
        window.scrollTo(0, scrollY);
      } catch {
        /* jsdom */
      }

      for (const rec of frozen) {
        rec.el.style.overflow = rec.overflow;
        rec.el.style.overflowX = rec.overflowX;
        rec.el.style.overflowY = rec.overflowY;
        rec.el.style.touchAction = rec.touchAction;
      }

      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
    };
  }, [locked, scrollRef]);
}

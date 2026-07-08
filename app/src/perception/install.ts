/**
 * perception/install.ts — window listener installer (Sprint 4 T4, extended Sprint 13 T7)
 *
 * Attaches focus/blur/mousemove/keydown listeners on `window` and emits
 * throttled events (max 1 per 500ms per kind) into the given EventBus.
 * Also attaches document-level scroll / mouseover / mouseout listeners
 * for scroll, hover_dwell, and focus_no_interaction signals.
 * Returns an uninstall function that removes all listeners.
 *
 * Throttle rationale: mousemove and keydown fire at very high frequency;
 * downsampling to 2 Hz keeps the aggregator's activeMs proxy sane while
 * still catching bursts of engagement. focus/blur fire rarely and use the
 * same throttle only for defence-in-depth.
 */

import type { EventBus, LyraEvent } from "./events";

const THROTTLE_MS = 500;
const HOVER_DWELL_MS = 3000;
const FOCUS_IDLE_MS = 180_000;
const IDLE_POLL_MS = 30_000;

type ThrottleKind = LyraEvent["kind"];

type InstallDeps = {
  win?: Pick<Window, "addEventListener" | "removeEventListener">;
  doc?: Pick<Document, "addEventListener" | "removeEventListener">;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => number;
  clearTimeout?: (id: number) => void;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
};

export function installPerceptionListeners(
  bus: EventBus,
  deps: InstallDeps = {},
): () => void {
  const win = deps.win ?? (typeof window !== "undefined" ? window : undefined);
  if (!win) {
    // SSR / test environment without a window — nothing to install.
    return () => {};
  }
  const clock = deps.now ?? Date.now;

  const doc = deps.doc ?? (typeof document !== "undefined" ? document : undefined);
  const st = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms) as unknown as number);
  const ct = deps.clearTimeout ?? ((id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>));
  const si = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms) as unknown as number);
  const ci = deps.clearInterval ?? ((id) => clearInterval(id as unknown as ReturnType<typeof setInterval>));

  const lastEmit: Partial<Record<ThrottleKind, number>> = {};

  function throttleEmit(kind: ThrottleKind, build: (at: number) => LyraEvent): void {
    const at = clock();
    const last = lastEmit[kind] ?? 0;
    if (at - last < THROTTLE_MS) return;
    lastEmit[kind] = at;
    bus.emit(build(at));
  }

  // ── focus_no_interaction state ───────────────────────────────────────────
  let lastInteractionAt = clock();
  let focused = true;
  let firedForThisIdle = false;

  // ── window listeners (existing 4, with focus_no_interaction tracking) ───
  const onFocus = () => {
    focused = true;
    throttleEmit("window_focus", (at) => ({ kind: "window_focus", at }));
  };
  const onBlur = () => {
    focused = false;
    throttleEmit("window_blur", (at) => ({ kind: "window_blur", at }));
  };
  const onMouseMove = () => {
    lastInteractionAt = clock();
    firedForThisIdle = false;
    throttleEmit("mouse_active", (at) => ({ kind: "mouse_active", at }));
  };
  const onKeyDown = () => {
    lastInteractionAt = clock();
    firedForThisIdle = false;
    throttleEmit("key_active", (at) => ({ kind: "key_active", at }));
  };

  win.addEventListener("focus", onFocus);
  win.addEventListener("blur", onBlur);
  win.addEventListener("mousemove", onMouseMove);
  win.addEventListener("keydown", onKeyDown);

  // ── scroll listener (capture, per-container throttle) ───────────────────
  const scrollLastEmit: Partial<Record<string, number>> = {};
  const lastScrollTop: Map<string, number> = new Map();
  const onScroll = (e: Event) => {
    const el = (e as Event & { target: EventTarget | null }).target as (Element & { scrollTop?: number }) | null;
    const container = extractContainer(el);
    if (!container) return;
    const scrollTop = el?.scrollTop ?? 0;
    const prevScrollTop = lastScrollTop.get(container) ?? 0;
    lastScrollTop.set(container, scrollTop);
    const direction: "up" | "down" = scrollTop < prevScrollTop ? "up" : "down";
    const at = clock();
    if (at - (scrollLastEmit[container] ?? 0) < THROTTLE_MS) return;
    scrollLastEmit[container] = at;
    bus.emit({
      kind: "scroll",
      at,
      container: container as "data_explorer" | "roadmap" | "other",
      direction,
    });
  };
  if (doc) {
    doc.addEventListener("scroll", onScroll as EventListener, { capture: true, passive: true } as AddEventListenerOptions);
  }

  // ── hover_dwell listener (capture, per-target setTimeout 3000ms) ─────────
  const dwellTimers = new Map<string, number>();
  const onMouseOver = (e: Event) => {
    const target = extractHoverTarget((e as Event & { target: EventTarget | null }).target);
    if (!target) return;
    if (dwellTimers.has(target)) return; // already timing
    const start = clock();
    const id = st(() => {
      const now = clock();
      bus.emit({ kind: "hover_dwell", at: now, target: target as "album_cover" | "small_note" | "trace_strip", ms: now - start });
      dwellTimers.delete(target);
    }, HOVER_DWELL_MS);
    dwellTimers.set(target, id);
  };
  const onMouseOut = (e: Event) => {
    const target = extractHoverTarget((e as Event & { target: EventTarget | null }).target);
    if (!target) return;
    const id = dwellTimers.get(target);
    if (id != null) {
      ct(id);
      dwellTimers.delete(target);
    }
  };
  if (doc) {
    doc.addEventListener("mouseover", onMouseOver as EventListener, true);
    doc.addEventListener("mouseout", onMouseOut as EventListener, true);
  }

  // ── focus_no_interaction poll every 30s ──────────────────────────────────
  const idlePollId = si(() => {
    if (!focused) return;
    const sinceMs = clock() - lastInteractionAt;
    if (sinceMs < FOCUS_IDLE_MS) return;
    if (firedForThisIdle) return;
    bus.emit({ kind: "focus_no_interaction", at: clock(), sinceMs });
    firedForThisIdle = true;
  }, IDLE_POLL_MS);

  return () => {
    win.removeEventListener("focus", onFocus);
    win.removeEventListener("blur", onBlur);
    win.removeEventListener("mousemove", onMouseMove);
    win.removeEventListener("keydown", onKeyDown);
    if (doc) {
      doc.removeEventListener("scroll", onScroll as EventListener, { capture: true });
      doc.removeEventListener("mouseover", onMouseOver as EventListener, true);
      doc.removeEventListener("mouseout", onMouseOut as EventListener, true);
    }
    ci(idlePollId);
    for (const id of dwellTimers.values()) {
      ct(id);
    }
    dwellTimers.clear();
  };
}

function extractContainer(target: EventTarget | null): string | null {
  const el = target as (Element | null);
  const found = el?.closest?.("[data-lyra-scroll]") ?? null;
  return found ? found.getAttribute("data-lyra-scroll") : null;
}

function extractHoverTarget(target: EventTarget | null): string | null {
  const el = target as (Element | null);
  const found = el?.closest?.("[data-lyra-hover]") ?? null;
  return found ? found.getAttribute("data-lyra-hover") : null;
}

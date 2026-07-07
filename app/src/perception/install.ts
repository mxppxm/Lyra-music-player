/**
 * perception/install.ts — window listener installer (Sprint 4 T4)
 *
 * Attaches focus/blur/mousemove/keydown listeners on `window` and emits
 * throttled events (max 1 per 500ms per kind) into the given EventBus.
 * Returns an uninstall function that removes all listeners.
 *
 * Throttle rationale: mousemove and keydown fire at very high frequency;
 * downsampling to 2 Hz keeps the aggregator's activeMs proxy sane while
 * still catching bursts of engagement. focus/blur fire rarely and use the
 * same throttle only for defence-in-depth.
 */

import type { EventBus, LyraEvent } from "./events";

const THROTTLE_MS = 500;

type ThrottleKind = LyraEvent["kind"];

type InstallDeps = {
  win?: Pick<Window, "addEventListener" | "removeEventListener">;
  now?: () => number;
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

  const lastEmit: Partial<Record<ThrottleKind, number>> = {};

  function throttleEmit(kind: ThrottleKind, build: (at: number) => LyraEvent): void {
    const at = clock();
    const last = lastEmit[kind] ?? 0;
    if (at - last < THROTTLE_MS) return;
    lastEmit[kind] = at;
    bus.emit(build(at));
  }

  const onFocus = () => throttleEmit("window_focus", (at) => ({ kind: "window_focus", at }));
  const onBlur = () => throttleEmit("window_blur", (at) => ({ kind: "window_blur", at }));
  const onMouseMove = () =>
    throttleEmit("mouse_active", (at) => ({ kind: "mouse_active", at }));
  const onKeyDown = () =>
    throttleEmit("key_active", (at) => ({ kind: "key_active", at }));

  win.addEventListener("focus", onFocus);
  win.addEventListener("blur", onBlur);
  win.addEventListener("mousemove", onMouseMove);
  win.addEventListener("keydown", onKeyDown);

  return () => {
    win.removeEventListener("focus", onFocus);
    win.removeEventListener("blur", onBlur);
    win.removeEventListener("mousemove", onMouseMove);
    win.removeEventListener("keydown", onKeyDown);
  };
}

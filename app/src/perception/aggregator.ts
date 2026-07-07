/**
 * perception/aggregator.ts — BehavioralAggregator (Sprint 4 T2)
 *
 * Derives BehavioralFeatures from a rolling EventBus window.
 * All computation is in-memory; no DB writes.
 */

import type { EventBus } from "./events";

export type BehavioralFeatures = {
  /** Window duration used for this snapshot, in ms */
  windowMs: number;
  /** Total active time (mouse or key events) within window, in ms */
  activeMs: number;
  /** Number of input_submit events */
  submits: number;
  /** Average time between successive submits, in ms; NaN if <2 submits */
  avgSubmitGapMs: number;
  /** Total keystrokes (proxy: sum of input_submit charCounts) */
  totalChars: number;
  /** Number of skips */
  skips: number;
  /** Number of natural completions */
  completions: number;
  /** skip / (skip + complete); 0 if both are 0 */
  skipRatio: number;
  /** Number of proactive dismissals */
  proactiveDismisses: number;
  /** true if window has a blur event without a subsequent focus event */
  isBlurred: boolean;
};

const DEFAULT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Compute BehavioralFeatures from the EventBus over the given window.
 *
 * @param bus       EventBus instance to query
 * @param windowMs  lookback window in ms (default 5 min)
 * @param now       timestamp override for testability (default Date.now())
 */
export function aggregate(
  bus: EventBus,
  windowMs: number = DEFAULT_WINDOW_MS,
  now?: number,
): BehavioralFeatures {
  const ts = now ?? Date.now();
  const events = bus.recent(windowMs, ts);

  // ── Active time ──────────────────────────────────────────────────────────
  // Count each distinct mouse_active / key_active event as 500ms of activity
  // (matches throttle in install.ts — one event per 500ms per kind).
  const ACTIVE_TICK_MS = 500;
  const activeCount = events.filter(
    (e) => e.kind === "mouse_active" || e.kind === "key_active",
  ).length;
  const activeMs = activeCount * ACTIVE_TICK_MS;

  // ── Submits ───────────────────────────────────────────────────────────────
  const submitEvents = events.filter((e) => e.kind === "input_submit");
  const submits = submitEvents.length;
  const totalChars = submitEvents.reduce(
    (sum, e) => sum + (e.kind === "input_submit" ? e.charCount : 0),
    0,
  );

  let avgSubmitGapMs = NaN;
  if (submits >= 2) {
    const times = submitEvents.map((e) => e.at).sort((a, b) => a - b);
    let gapSum = 0;
    for (let i = 1; i < times.length; i++) {
      gapSum += times[i] - times[i - 1];
    }
    avgSubmitGapMs = gapSum / (times.length - 1);
  }

  // ── Skips / Completions ───────────────────────────────────────────────────
  const skips = events.filter((e) => e.kind === "skip").length;
  const completions = events.filter((e) => e.kind === "complete").length;
  const skipRatio =
    skips + completions === 0 ? 0 : skips / (skips + completions);

  // ── Proactive dismissals ──────────────────────────────────────────────────
  const proactiveDismisses = events.filter(
    (e) => e.kind === "proactive_dismissed",
  ).length;

  // ── Blur state ────────────────────────────────────────────────────────────
  // isBlurred = last focus/blur event is a blur (or there's a blur with no
  // subsequent focus at all).
  let isBlurred = false;
  for (const e of events) {
    if (e.kind === "window_focus") isBlurred = false;
    else if (e.kind === "window_blur") isBlurred = true;
  }

  return {
    windowMs,
    activeMs,
    submits,
    avgSubmitGapMs,
    totalChars,
    skips,
    completions,
    skipRatio,
    proactiveDismisses,
    isBlurred,
  };
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DreamScheduler, parseHHMM } from "./dreamScheduler";

// ── parseHHMM ────────────────────────────────────────────────────────────────

describe("parseHHMM", () => {
  it("accepts '03:14'", () => expect(parseHHMM("03:14")).toEqual({ h: 3, m: 14 }));
  it("accepts '23:59'", () => expect(parseHHMM("23:59")).toEqual({ h: 23, m: 59 }));
  it("accepts '00:00'", () => expect(parseHHMM("00:00")).toEqual({ h: 0, m: 0 }));
  it("rejects '3:14' (single-digit hour)", () => expect(parseHHMM("3:14")).toBeNull());
  it("rejects '25:99' (out of range)", () => expect(parseHHMM("25:99")).toBeNull());
  it("rejects '03-14' (wrong separator)", () => expect(parseHHMM("03-14")).toBeNull());
  it("rejects empty string", () => expect(parseHHMM("")).toBeNull());
  it("rejects '24:00' (hour == 24)", () => expect(parseHHMM("24:00")).toBeNull());
  it("rejects '12:60' (minute == 60)", () => expect(parseHHMM("12:60")).toBeNull());
});

// ── helpers ───────────────────────────────────────────────────────────────────

/** Build a controllable activity listener */
function makeActivityListener() {
  let _cb: (() => void) | null = null;
  const listen = (cb: () => void) => {
    _cb = cb;
    return () => {
      _cb = null;
    };
  };
  const fire = () => _cb?.();
  return { listen, fire };
}

/** Advance fake timers by one tick (60 s) and flush async callbacks */
async function tick() {
  await vi.advanceTimersByTimeAsync(60_000);
}

/**
 * Build a Date with a specific LOCAL hour and minute on 2026-07-07.
 * This avoids UTC/local confusion since the scheduler uses getHours()/getMinutes().
 */
function localDate(h: number, m: number, day = 7): Date {
  const d = new Date(2026, 6, day, h, m, 0, 0); // month is 0-indexed
  return d;
}

// ── Daily trigger ─────────────────────────────────────────────────────────────

describe("DreamScheduler – daily trigger", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("calls runReflect at the configured time on a fresh day", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const now = localDate(3, 14);
    const { listen } = makeActivityListener();

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => now,
      onActivityListen: listen,
    });

    sched.start();
    await tick();

    expect(runReflect).toHaveBeenCalledOnce();
    sched.stop();
  });

  it("does NOT call runReflect at the wrong time", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const now = localDate(4, 0);
    const { listen } = makeActivityListener();

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => now,
      onActivityListen: listen,
    });

    sched.start();
    await tick();

    expect(runReflect).not.toHaveBeenCalled();
    sched.stop();
  });

  it("does NOT call runReflect a second time on the same day", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const now = localDate(3, 14);
    const { listen } = makeActivityListener();

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => now,
      onActivityListen: listen,
    });

    sched.start();
    await tick(); // fires
    await tick(); // same day/time — suppressed

    expect(runReflect).toHaveBeenCalledOnce();
    sched.stop();
  });

  it("fires again the next day", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen } = makeActivityListener();

    let currentDate = localDate(3, 14, 7);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => currentDate,
      onActivityListen: listen,
    });

    sched.start();
    await tick(); // Day 7
    expect(runReflect).toHaveBeenCalledTimes(1);

    currentDate = localDate(3, 14, 8); // Day 8
    await tick();
    expect(runReflect).toHaveBeenCalledTimes(2);

    sched.stop();
  });
});

// ── Idle trigger ──────────────────────────────────────────────────────────────

describe("DreamScheduler – idle trigger", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("fires after idle threshold is exceeded", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen } = makeActivityListener();

    const idleMinutes = 30;
    // Start at 10:00 local — safe daytime, outside sleep window
    let currentTime = localDate(10, 0);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes,
      runReflect,
      clock: () => currentTime,
      onActivityListen: listen,
    });

    sched.start();
    // Advance clock past idle threshold without firing activity
    currentTime = new Date(currentTime.getTime() + (idleMinutes + 1) * 60_000);
    await tick();

    expect(runReflect).toHaveBeenCalledOnce();
    sched.stop();
  });

  it("does NOT fire when user was recently active", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen, fire: fireActivity } = makeActivityListener();

    let currentTime = localDate(10, 0);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 30,
      runReflect,
      clock: () => currentTime,
      onActivityListen: listen,
    });

    sched.start();
    // Advance only 10 minutes (below 30-min threshold) and fire activity
    currentTime = new Date(currentTime.getTime() + 10 * 60_000);
    fireActivity();
    await tick();

    expect(runReflect).not.toHaveBeenCalled();
    sched.stop();
  });

  it("suppresses idle trigger during sleep hours (22:00-06:00)", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen } = makeActivityListener();

    // 23:00 local — inside sleep window
    let currentTime = localDate(23, 0);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "04:14",
      idleMinutes: 30,
      runReflect,
      clock: () => currentTime,
      onActivityListen: listen,
    });

    sched.start();
    // Advance past idle threshold — still in sleep window
    currentTime = new Date(currentTime.getTime() + 60 * 60_000);
    await tick();

    expect(runReflect).not.toHaveBeenCalled();
    sched.stop();
  });

  it("suppresses idle trigger in early morning sleep window (02:00)", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen } = makeActivityListener();

    // 02:00 local — inside sleep window (< 06:00)
    let currentTime = localDate(2, 0);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "04:14",
      idleMinutes: 30,
      runReflect,
      clock: () => currentTime,
      onActivityListen: listen,
    });

    sched.start();
    currentTime = new Date(currentTime.getTime() + 60 * 60_000);
    await tick();

    expect(runReflect).not.toHaveBeenCalled();
    sched.stop();
  });

  it("respects 6-hour cooldown between idle runs", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen } = makeActivityListener();

    // 10:00 local — daytime
    let currentTime = localDate(10, 0);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 30,
      runReflect,
      clock: () => currentTime,
      onActivityListen: listen,
    });

    sched.start();

    // First idle trigger: advance clock 31 minutes, fire one tick
    currentTime = new Date(currentTime.getTime() + 31 * 60_000);
    await tick();
    expect(runReflect).toHaveBeenCalledOnce();

    // 2 hours later (still within 6h cooldown, still daytime ~12:31)
    currentTime = new Date(currentTime.getTime() + 2 * 60 * 60_000);
    await tick();
    expect(runReflect).toHaveBeenCalledOnce(); // still once

    // Another 5 hours later (7h total from first run, ~17:31 local — still daytime)
    currentTime = new Date(currentTime.getTime() + 5 * 60 * 60_000);
    await tick();
    expect(runReflect).toHaveBeenCalledTimes(2);

    sched.stop();
  });

  it("does NOT fire when idleMinutes is 0", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen } = makeActivityListener();

    let currentTime = localDate(10, 0);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => currentTime,
      onActivityListen: listen,
    });

    sched.start();
    currentTime = new Date(currentTime.getTime() + 2 * 60 * 60_000);
    await tick();

    expect(runReflect).not.toHaveBeenCalled();
    sched.stop();
  });
});

// ── Concurrency guard ─────────────────────────────────────────────────────────

describe("DreamScheduler – concurrency", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("does not run a second reflect while first is still in progress", async () => {
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((res) => {
      resolveFirst = res;
    });
    const runReflect = vi.fn()
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValue(undefined);

    const { listen } = makeActivityListener();
    const now = localDate(3, 14);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => now,
      onActivityListen: listen,
    });

    sched.start();

    // First tick starts the reflect (still pending — firstPromise not resolved)
    await tick();
    expect(runReflect).toHaveBeenCalledOnce();
    expect(sched.isRunning()).toBe(true);

    // Second tick — _running is true, so no-op
    await tick();
    expect(runReflect).toHaveBeenCalledOnce(); // still once

    // Release the first reflect and flush all microtask queues
    resolveFirst();
    // Need several microtask flushes: resolve → await runReflect → onSuccess → finally
    for (let i = 0; i < 10; i++) await Promise.resolve();

    expect(sched.isRunning()).toBe(false);
    sched.stop();
  });

  it("releases lock even when runReflect throws", async () => {
    const runReflect = vi.fn().mockRejectedValue(new Error("boom"));
    const { listen } = makeActivityListener();
    const now = localDate(3, 14);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => now,
      onActivityListen: listen,
    });

    sched.start();
    await tick();
    // Flush rejection handling
    await Promise.resolve();
    await Promise.resolve();

    expect(sched.isRunning()).toBe(false);
    sched.stop();
  });
});

// ── stop() / start() lifecycle ────────────────────────────────────────────────

describe("DreamScheduler – lifecycle", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("does not fire after stop()", async () => {
    const runReflect = vi.fn().mockResolvedValue(undefined);
    const { listen } = makeActivityListener();
    const now = localDate(3, 14);

    const sched = new DreamScheduler({
      dailyTimeHHMM: "03:14",
      idleMinutes: 0,
      runReflect,
      clock: () => now,
      onActivityListen: listen,
    });

    sched.start();
    sched.stop();
    await tick();

    expect(runReflect).not.toHaveBeenCalled();
  });
});

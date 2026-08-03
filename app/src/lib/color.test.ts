import { describe, it, expect } from "vitest";
import {
  padHSL,
  timeBase,
  mixHSL,
  ambientColor,
  hslToString,
} from "./color";

describe("padHSL", () => {
  it("maps p=-1 to blue hue 240", () => {
    expect(padHSL({ p: -1, a: 0, d: 0 }).h).toBeCloseTo(240);
  });

  it("maps p=+1 to warm hue 30", () => {
    expect(padHSL({ p: 1, a: 0, d: 0 }).h).toBeCloseTo(30);
  });

  it("saturation follows arousal", () => {
    expect(padHSL({ p: 0, a: 0, d: 0 }).s).toBe(32);
    expect(padHSL({ p: 0, a: 1, d: 0 }).s).toBe(68);
    expect(padHSL({ p: 0, a: -1, d: 0 }).s).toBe(-4); // formula allows negatives; clamp is a later job
  });

  it("lightness follows dominance", () => {
    expect(padHSL({ p: 0, a: 0, d: 0 }).l).toBe(82);
    expect(padHSL({ p: 0, a: 0, d: 1 }).l).toBe(90);
    expect(padHSL({ p: 0, a: 0, d: -1 }).l).toBe(74);
  });
});

describe("timeBase", () => {
  it("early morning 06:00 returns cream tone", () => {
    const t = new Date("2026-07-06T06:00:00");
    const c = timeBase(t);
    expect(c.h).toBe(30);
    expect(c.s).toBe(15);
    expect(c.l).toBe(92);
  });

  it("late night 03:30 returns deep indigo", () => {
    const t = new Date("2026-07-06T03:30:00");
    const c = timeBase(t);
    expect(c.h).toBe(235);
    expect(c.s).toBe(30);
    expect(c.l).toBe(18);
  });

  it("noon 12:30 returns pale apple green", () => {
    const t = new Date("2026-07-06T12:30:00");
    const c = timeBase(t);
    expect(c.h).toBe(100);
    expect(c.s).toBe(12);
    expect(c.l).toBe(91);
  });
});

describe("mixHSL", () => {
  it("weight 0 returns a unchanged", () => {
    expect(mixHSL({ h: 100, s: 20, l: 80 }, { h: 200, s: 40, l: 60 }, 0)).toEqual({
      h: 100, s: 20, l: 80,
    });
  });

  it("weight 1 returns b unchanged", () => {
    expect(mixHSL({ h: 100, s: 20, l: 80 }, { h: 200, s: 40, l: 60 }, 1)).toEqual({
      h: 200, s: 40, l: 60,
    });
  });

  it("weight 0.5 returns componentwise midpoint", () => {
    const m = mixHSL({ h: 100, s: 20, l: 80 }, { h: 200, s: 40, l: 60 }, 0.5);
    expect(m.h).toBe(150);
    expect(m.s).toBe(30);
    expect(m.l).toBe(70);
  });
});

describe("ambientColor", () => {
  it("produces a valid CSS hsl() string", () => {
    const now = new Date("2026-07-06T14:00:00");
    const out = ambientColor({ p: 0.3, a: -0.1, d: 0.2 }, now);
    expect(out).toMatch(/^hsl\(\d+(\.\d+)?, \d+(\.\d+)?%, \d+(\.\d+)?%\)$/);
  });
});

describe("hslToString", () => {
  it("formats components with %", () => {
    expect(hslToString({ h: 120, s: 50, l: 80 })).toBe("hsl(120, 50%, 80%)");
  });
});

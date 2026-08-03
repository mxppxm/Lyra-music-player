import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlowCanvas, glowPalette } from "./GlowCanvas";
import { padHSL } from "../lib/color";

describe("glowPalette", () => {
  it("derives the base hue from the emotional PAD hue", () => {
    const pad = { p: 0.6, a: 0.2, d: 0 };
    const [base] = glowPalette(pad);
    expect(base.h).toBeCloseTo(padHSL(pad).h, 5);
  });

  it("keeps saturation and lightness in clearly visible ranges", () => {
    for (const pad of [
      { p: -1, a: -1, d: -1 },
      { p: 1, a: 1, d: 1 },
      { p: 0, a: 0, d: 0 },
    ]) {
      for (const c of glowPalette(pad)) {
        expect(c.s).toBeGreaterThanOrEqual(48);
        expect(c.s).toBeLessThanOrEqual(90);
        expect(c.l).toBeGreaterThanOrEqual(42);
        expect(c.l).toBeLessThanOrEqual(72);
        expect(c.h).toBeGreaterThanOrEqual(0);
        expect(c.h).toBeLessThan(360);
      }
    }
  });

  it("returns three distinct hues for depth", () => {
    const [a, b, c] = glowPalette({ p: 0.2, a: 0.1, d: 0 });
    expect(a.h).not.toBeCloseTo(b.h, 3);
    expect(a.h).not.toBeCloseTo(c.h, 3);
  });
});

describe("GlowCanvas", () => {
  it("is transparent while inactive and fully visible when active", () => {
    const { rerender } = render(<GlowCanvas pad={{ p: 0, a: 0, d: 0 }} active={false} />);
    expect(screen.getByTestId("glow-canvas").style.opacity).toBe("0");
    rerender(<GlowCanvas pad={{ p: 0, a: 0, d: 0 }} active={true} />);
    expect(screen.getByTestId("glow-canvas").style.opacity).toBe("1");
  });
});

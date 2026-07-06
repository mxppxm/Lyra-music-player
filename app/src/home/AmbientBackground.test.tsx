import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AmbientBackground } from "./AmbientBackground";

describe("AmbientBackground", () => {
  it("renders children inside the surface", () => {
    render(
      <AmbientBackground pad={{ p: 0, a: 0, d: 0 }} now={new Date("2026-07-06T14:00:00")}>
        <div data-testid="child">hello</div>
      </AmbientBackground>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies an hsl() background derived from PAD + time", () => {
    render(
      <AmbientBackground
        pad={{ p: 0.5, a: 0.2, d: 0.1 }}
        now={new Date("2026-07-06T14:00:00")}
      >
        <span>x</span>
      </AmbientBackground>,
    );
    const surface = screen.getByTestId("ambient-surface");
    // backgroundColor is set and is a color (RGB or HSL normalized by DOM)
    expect(surface.style.backgroundColor).toBeTruthy();
    expect(surface.style.backgroundColor).toMatch(/^(hsl|rgb)/);
  });

  it("has full-viewport dimensions and applies the ambient transition", () => {
    render(
      <AmbientBackground pad={{ p: 0, a: 0, d: 0 }} now={new Date()}>
        <span>x</span>
      </AmbientBackground>,
    );
    const surface = screen.getByTestId("ambient-surface");
    expect(surface.style.minHeight).toBe("100vh");
    expect(surface.className).toContain("lyra-ambient");
  });
});

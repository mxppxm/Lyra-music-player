import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CoverArt, angleFromCssTransform } from "./CoverBackground";

function discEl(): HTMLElement {
  return screen.getByTestId("cover-art").firstElementChild as HTMLElement;
}

describe("angleFromCssTransform", () => {
  it("reads 2d and 3d rotation matrices", () => {
    expect(angleFromCssTransform("none")).toBe(0);
    expect(angleFromCssTransform("matrix(0, 1, -1, 0, 0, 0)")).toBeCloseTo(90);
  });
});

describe("CoverArt rotation gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not arm a CSS spin for a non-CD cover", () => {
    render(
      <CoverArt
        url="https://example.com/cover.jpg"
        cd={false}
        spinning
      />,
    );
    expect(discEl().className).not.toMatch(/disc--armed/);
    expect(discEl().className).not.toMatch(/disc--spinning/);
  });

  it("freezes angle when paused or sliding away, and restarts from zero when re-centered", () => {
    const { rerender } = render(
      <CoverArt
        url="https://example.com/cover.jpg"
        cd
        active
        spinning
      />,
    );
    expect(discEl().className).toMatch(/disc--armed/);
    expect(discEl().className).toMatch(/disc--spinning/);

    rerender(
      <CoverArt
        url="https://example.com/cover.jpg"
        cd
        active
        spinning={false}
      />,
    );
    // Still armed (keeps compositor angle) but not running.
    expect(discEl().className).toMatch(/disc--armed/);
    expect(discEl().className).not.toMatch(/disc--spinning/);

    // Sliding off-screen stays armed+paused so the mid-spin angle freezes.
    rerender(
      <CoverArt
        url="https://example.com/cover.jpg"
        cd
        active={false}
        spinning={false}
      />,
    );
    expect(discEl().className).toMatch(/disc--armed/);
    expect(discEl().className).not.toMatch(/disc--spinning/);

    rerender(
      <CoverArt
        url="https://example.com/cover.jpg"
        cd
        active
        spinning={false}
      />,
    );
    expect(discEl().className).toMatch(/disc--armed/);
    expect(discEl().className).not.toMatch(/disc--spinning/);
  });

  it("eases the live spin angle back to 0° when leaving CD mode instead of snapping", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(performance, "now").mockReturnValue(0);
    // Only return a mid-spin matrix while the CSS animation class is still on
    // — mirrors the real bug where removing --armed made transform "none".
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) => {
      const className = String((el as Element).className ?? "");
      if (className.includes("disc--armed")) {
        return { transform: "matrix(0, 1, -1, 0, 0, 0)" } as CSSStyleDeclaration;
      }
      return { transform: "none" } as CSSStyleDeclaration;
    });

    const { rerender } = render(
      <CoverArt
        url="https://example.com/cover.jpg"
        cd
        active
        spinning
      />,
    );

    rerender(
      <CoverArt
        url="https://example.com/cover.jpg"
        cd={false}
        active
        spinning={false}
      />,
    );

    // Captured from the still-armed frame, then frozen as an inline rotate.
    expect(discEl().style.transform).toMatch(/rotate\(90deg\)/);

    act(() => {
      vi.spyOn(performance, "now").mockReturnValue(280);
      const tick = frames[frames.length - 1];
      tick?.(280);
    });
    const mid = discEl().style.transform;
    expect(mid).toMatch(/^rotate\(/);
    expect(mid).not.toBe("rotate(0deg)");
    expect(mid).not.toBe("rotate(90deg)");
  });

  it("starts a prefetched neighbor from a fresh armed spin when it becomes current", () => {
    const { rerender } = render(
      <CoverArt
        url="https://example.com/next.jpg"
        cd
        active={false}
        spinning={false}
      />,
    );
    expect(discEl().className).toMatch(/disc--armed/);
    expect(discEl().className).not.toMatch(/disc--spinning/);

    rerender(
      <CoverArt
        url="https://example.com/next.jpg"
        cd
        active
        spinning
      />,
    );
    expect(discEl().className).toMatch(/disc--armed/);
    expect(discEl().className).toMatch(/disc--spinning/);
  });

  it("retries a neighbor cover that failed before becoming current", () => {
    const { container, rerender } = render(
      <CoverArt
        url="https://example.com/next.jpg"
        cd
        active={false}
        spinning={false}
      />,
    );
    fireEvent.error(container.querySelector("img")!);
    expect(screen.queryByTestId("cover-art")).toBeNull();

    rerender(
      <CoverArt
        url="https://example.com/next.jpg"
        cd
        active
        spinning={false}
      />,
    );
    expect(screen.getByTestId("cover-art")).toBeInTheDocument();
  });
});

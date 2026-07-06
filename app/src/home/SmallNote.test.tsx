import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SmallNote } from "./SmallNote";

const LONG =
  "我选这首因为它的贝斯在第 20 秒像是接住你此刻的疲惫，大提琴在第 47 秒抬起时不是高兴，是那种看到希望的抬起。";

describe("SmallNote", () => {
  it("renders truncated with ellipsis when text is longer than ellipsizeAt", () => {
    render(<SmallNote text={LONG} ellipsizeAt={12} />);
    const node = screen.getByTestId("small-note");
    expect(node.textContent!).toMatch(/…$/);
    expect(node.textContent!.length).toBeLessThan(LONG.length);
  });

  it("renders full text when short", () => {
    render(<SmallNote text="给你的早。" ellipsizeAt={40} />);
    expect(screen.getByTestId("small-note").textContent).toBe("给你的早。");
  });

  it("expands full text on click", () => {
    render(<SmallNote text={LONG} ellipsizeAt={12} autoCollapseMs={99999} />);
    fireEvent.click(screen.getByTestId("small-note"));
    expect(screen.getByTestId("small-note").textContent).toBe(LONG);
  });

  it("auto-collapses back after autoCollapseMs", () => {
    vi.useFakeTimers();
    render(<SmallNote text={LONG} ellipsizeAt={12} autoCollapseMs={8000} />);
    fireEvent.click(screen.getByTestId("small-note"));
    expect(screen.getByTestId("small-note").textContent).toBe(LONG);
    act(() => {
      vi.advanceTimersByTime(8001);
    });
    expect(screen.getByTestId("small-note").textContent).toMatch(/…$/);
    vi.useRealTimers();
  });
});

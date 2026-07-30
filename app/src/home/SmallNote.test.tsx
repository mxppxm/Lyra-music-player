import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SmallNote } from "./SmallNote";

const LONG =
  "我选这首因为它的贝斯在第 20 秒像是接住你此刻的疲惫，大提琴在第 47 秒抬起时不是高兴，是那种看到希望的抬起。";

describe("SmallNote", () => {
  it("always renders full text", () => {
    render(<SmallNote text={LONG} />);
    expect(screen.getByTestId("small-note").textContent).toBe(LONG);
  });

  it("renders short text unchanged", () => {
    render(<SmallNote text="给你的早安。" />);
    expect(screen.getByTestId("small-note").textContent).toBe("给你的早安。");
  });
});

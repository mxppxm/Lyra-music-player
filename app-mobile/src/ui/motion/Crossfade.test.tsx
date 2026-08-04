import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Crossfade } from "./Crossfade";

describe("Crossfade", () => {
  it("renders children", () => {
    render(<Crossfade text="hello">hello</Crossfade>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("remounts content when text changes", () => {
    const { rerender, container } = render(<Crossfade text="a">a</Crossfade>);
    const first = container.querySelector(".lyra-text-in");
    rerender(<Crossfade text="b">b</Crossfade>);
    const second = container.querySelector(".lyra-text-in");
    expect(second).not.toBe(first);
    expect(screen.getByText("b")).toBeInTheDocument();
    expect(screen.queryByText("a")).toBeNull();
  });
});

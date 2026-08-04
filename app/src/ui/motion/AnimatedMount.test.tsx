import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AnimatedMount } from "./AnimatedMount";

describe("AnimatedMount", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders children while open", () => {
    render(
      <AnimatedMount open={true} disabled={false}>
        <div data-testid="dialog">hi</div>
      </AnimatedMount>,
    );
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
  });

  it("keeps children mounted during exit, then unmounts", () => {
    const { rerender } = render(
      <AnimatedMount open={true} disabled={false} exitMs={300}>
        <div data-testid="dialog">hi</div>
      </AnimatedMount>,
    );
    rerender(
      <AnimatedMount open={false} disabled={false} exitMs={300}>
        <div data-testid="dialog">hi</div>
      </AnimatedMount>,
    );
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByTestId("dialog")).toBeNull();
  });

  it("renders backdrop when provided", () => {
    render(
      <AnimatedMount open={true} disabled={false} backdrop={<div data-testid="backdrop" />}>
        <div data-testid="dialog" />
      </AnimatedMount>,
    );
    expect(screen.getByTestId("backdrop")).toBeInTheDocument();
    expect(screen.getByTestId("dialog")).toBeInTheDocument();
  });

  it("disabled mode unmounts immediately on close", () => {
    const { rerender } = render(
      <AnimatedMount open={true} disabled={true}>
        <div data-testid="dialog" />
      </AnimatedMount>,
    );
    rerender(
      <AnimatedMount open={false} disabled={true}>
        <div data-testid="dialog" />
      </AnimatedMount>,
    );
    expect(screen.queryByTestId("dialog")).toBeNull();
  });
});

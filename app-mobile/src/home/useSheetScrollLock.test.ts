import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createRef } from "react";
import {
  shouldBlockSheetTouchMove,
  useSheetScrollLock,
} from "./useSheetScrollLock";

describe("shouldBlockSheetTouchMove", () => {
  it("blocks touches outside the scroll pane", () => {
    const scroll = document.createElement("div");
    const outside = document.createElement("div");
    expect(
      shouldBlockSheetTouchMove({
        target: outside,
        scrollEl: scroll,
        startY: 100,
        clientY: 80,
      }),
    ).toBe(true);
  });

  it("blocks pull-down when already at top", () => {
    const scroll = document.createElement("div");
    Object.defineProperty(scroll, "scrollTop", { value: 0 });
    Object.defineProperty(scroll, "scrollHeight", { value: 500 });
    Object.defineProperty(scroll, "clientHeight", { value: 200 });
    const inner = document.createElement("p");
    scroll.appendChild(inner);
    expect(
      shouldBlockSheetTouchMove({
        target: inner,
        scrollEl: scroll,
        startY: 100,
        clientY: 140, // finger moved down → pull content down at top
      }),
    ).toBe(true);
  });

  it("allows scrolling down when not at bottom", () => {
    const scroll = document.createElement("div");
    Object.defineProperty(scroll, "scrollTop", { value: 20 });
    Object.defineProperty(scroll, "scrollHeight", { value: 500 });
    Object.defineProperty(scroll, "clientHeight", { value: 200 });
    const inner = document.createElement("p");
    scroll.appendChild(inner);
    expect(
      shouldBlockSheetTouchMove({
        target: inner,
        scrollEl: scroll,
        startY: 100,
        clientY: 60, // finger up → content scrolls down
      }),
    ).toBe(false);
  });

  it("blocks pull-up when already at bottom", () => {
    const scroll = document.createElement("div");
    Object.defineProperty(scroll, "scrollTop", { value: 300 });
    Object.defineProperty(scroll, "scrollHeight", { value: 500 });
    Object.defineProperty(scroll, "clientHeight", { value: 200 });
    const inner = document.createElement("p");
    scroll.appendChild(inner);
    expect(
      shouldBlockSheetTouchMove({
        target: inner,
        scrollEl: scroll,
        startY: 100,
        clientY: 40,
      }),
    ).toBe(true);
  });
});

describe("useSheetScrollLock", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  });

  afterEach(() => {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  });

  it("locks body overflow while active and restores on unlock", () => {
    const scrollRef = createRef<HTMLDivElement>();
    const { rerender } = renderHook(
      ({ locked }) => useSheetScrollLock(locked, scrollRef),
      { initialProps: { locked: true } },
    );
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.touchAction).toBe("none");

    rerender({ locked: false });
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.touchAction).toBe("");
  });
});

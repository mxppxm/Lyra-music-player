import { describe, expect, it } from "vitest";
import { videoFullscreenTarget } from "./CoverVideoMorph";

describe("videoFullscreenTarget", () => {
  it("fills the viewport", () => {
    const box = videoFullscreenTarget();
    expect(box.top).toBe(0);
    expect(box.left).toBe(0);
    expect(box.width).toBe(window.innerWidth);
    expect(box.height).toBe(window.innerHeight);
  });
});

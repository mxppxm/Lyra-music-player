import { describe, it, expect } from "vitest";
import { lockDepthGuidance } from "./lockDepthGuidance";

describe("lockDepthGuidance", () => {
  it("1–2: light touch, no questions", () => {
    for (const n of [1, 2]) {
      const s = lockDepthGuidance(n);
      expect(s).toMatch(/轻触|停住|锁住/);
      expect(s).toMatch(/禁止发问|不要发问|不许发问/);
      expect(s).not.toMatch(/真问|可回/);
    }
  });

  it("3–4: deeper motive, rhetorical ok", () => {
    for (const n of [3, 4]) {
      const s = lockDepthGuidance(n);
      expect(s).toMatch(/下探|确认|回避/);
      expect(s).toMatch(/修辞/);
      expect(s).not.toMatch(/可回的真问|真问许可/);
    }
  });

  it("5–7: deep, rhetorical primary", () => {
    for (const n of [5, 7]) {
      const s = lockDepthGuidance(n);
      expect(s).toMatch(/深|还在转|松|硬/);
      expect(s).toMatch(/修辞/);
    }
  });

  it("8+: peak, occasional real question allowed", () => {
    const s = lockDepthGuidance(8);
    expect(s).toMatch(/真问|可回/);
    expect(s).toMatch(/近期|已经问过|别再问/);
  });
});

import { describe, expect, it } from "vitest";
import {
  canToggleImmersive,
  centeredRailRole,
  compensateImmersiveCoverPosition,
  shouldCenterThinkingPlaceholder,
  shouldShowInlineThinking,
} from "./immersiveCoverMotion";

describe("compensateImmersiveCoverPosition", () => {
  it("cancels layout movement so the visible cover stays screen-centered", () => {
    const result = compensateImmersiveCoverPosition(
      { x: 4, y: 80, scale: 0.92 },
      { left: 90, top: 250, width: 220, height: 220 },
      { width: 400, height: 700 },
    );

    // Visible center is (200, 360), 10px below viewport center.
    expect(result).toEqual({ x: 4, y: 70, scale: 0.92 });
  });

  it("leaves an already-centered cover unchanged", () => {
    const current = { x: 0, y: 60, scale: 1 };
    expect(
      compensateImmersiveCoverPosition(
        current,
        { left: 100, top: 240, width: 200, height: 200 },
        { width: 400, height: 680 },
      ),
    ).toEqual(current);
  });

  it("shows the inline thinking note only outside immersive mode", () => {
    expect(shouldShowInlineThinking(false, true, false)).toBe(true);
    expect(shouldShowInlineThinking(true, true, false)).toBe(false);
    expect(shouldShowInlineThinking(false, true, true)).toBe(false);
  });

  it("lets the stage toggle immersive in both directions while a song is selected", () => {
    expect(canToggleImmersive("thinking")).toBe(true);
    expect(canToggleImmersive("playing")).toBe(true);
    expect(canToggleImmersive("idle")).toBe(false);
    expect(canToggleImmersive("error")).toBe(false);
  });
});

describe("centeredRailRole", () => {
  it("keeps the data current page centered while the rail is at rest", () => {
    expect(centeredRailRole(null, false)).toBe("current");
    expect(centeredRailRole("next", false)).toBe("current");
  });

  it("follows the committed neighbor while the handoff plays out", () => {
    expect(centeredRailRole("next", true)).toBe("next");
    expect(centeredRailRole("previous", true)).toBe("prev");
  });
});

describe("shouldCenterThinkingPlaceholder", () => {
  const base = {
    pending: true,
    settling: false,
    direction: "next" as const,
    committedNextSongId: null,
    currentSongId: null,
  };

  it("centers the placeholder once its slide finished and selection is open", () => {
    expect(shouldCenterThinkingPlaceholder(base)).toBe(true);
  });

  it("waits for the slide to finish", () => {
    expect(
      shouldCenterThinkingPlaceholder({ ...base, settling: true }),
    ).toBe(false);
  });

  it("leaves a committed real neighbor alone", () => {
    expect(
      shouldCenterThinkingPlaceholder({
        ...base,
        committedNextSongId: "queued",
      }),
    ).toBe(false);
    expect(
      shouldCenterThinkingPlaceholder({ ...base, direction: "previous" }),
    ).toBe(false);
  });

  it("never overrides a song that already started", () => {
    expect(
      shouldCenterThinkingPlaceholder({ ...base, currentSongId: "song" }),
    ).toBe(false);
  });
});

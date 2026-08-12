import { describe, expect, it } from "vitest";
import { shouldEnterVideoFromCover } from "./coverVideoFullscreen";

describe("shouldEnterVideoFromCover", () => {
  it("allows current cover while playing", () => {
    expect(
      shouldEnterVideoFromCover({
        isPlayingOrPaused: true,
        hasCurrentCover: true,
        isNeighborSlot: false,
      }),
    ).toBe(true);
  });

  it("blocks neighbor slots", () => {
    expect(
      shouldEnterVideoFromCover({
        isPlayingOrPaused: true,
        hasCurrentCover: true,
        isNeighborSlot: true,
      }),
    ).toBe(false);
  });

  it("blocks when idle / no cover", () => {
    expect(
      shouldEnterVideoFromCover({
        isPlayingOrPaused: false,
        hasCurrentCover: true,
        isNeighborSlot: false,
      }),
    ).toBe(false);
    expect(
      shouldEnterVideoFromCover({
        isPlayingOrPaused: true,
        hasCurrentCover: false,
        isNeighborSlot: false,
      }),
    ).toBe(false);
  });
});

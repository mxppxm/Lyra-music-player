import { describe, expect, it } from "vitest";
import { pickNativeReconcileSongId } from "./nativeReconcile";

describe("pickNativeReconcileSongId", () => {
  it("prefers the live native songId over drained events", () => {
    expect(
      pickNativeReconcileSongId("now-playing", [
        { songId: "older" },
        { songId: "newer-event" },
      ]),
    ).toBe("now-playing");
  });

  it("falls back to the latest drained event when native id is missing", () => {
    expect(
      pickNativeReconcileSongId("", [
        { songId: "b" },
        { songId: "c" },
      ]),
    ).toBe("c");
  });

  it("skips blank event ids when falling back", () => {
    expect(
      pickNativeReconcileSongId(null, [
        { songId: "b" },
        { songId: "" },
        { songId: null },
      ]),
    ).toBe("b");
  });

  it("returns null when nothing is known", () => {
    expect(pickNativeReconcileSongId(undefined, [])).toBeNull();
  });
});

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LyraAudio } from "@lyra/platform-ios";
import { refillPlaybackQueue } from "./refillPlaybackQueue";
import { usePrefetchNext } from "./usePrefetchNext";

vi.mock("@lyra/platform-ios", () => ({
  LyraAudio: {
    clearNextTrack: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("./refillPlaybackQueue", () => ({
  refillPlaybackQueue: vi.fn(async () => 0),
}));

describe("usePrefetchNext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the existing forward plan when the current song changes", async () => {
    const orchestrator = {
      clearPrefetchedNext: vi.fn(),
    };
    const { rerender } = renderHook(
      ({ songId }) =>
        usePrefetchNext(orchestrator as never, {
          songId,
          playing: true,
          paused: false,
          progress: 0,
        }),
      { initialProps: { songId: "song-a" } },
    );
    await waitFor(() => expect(refillPlaybackQueue).toHaveBeenCalledTimes(1));

    rerender({ songId: "song-b" });
    await waitFor(() => expect(refillPlaybackQueue).toHaveBeenCalledTimes(2));

    expect(LyraAudio.clearNextTrack).not.toHaveBeenCalled();
    expect(orchestrator.clearPrefetchedNext).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(LyraAudio.addListener)
        .mock.calls.some(([eventName]) => String(eventName) === "nativeAdvanced"),
    ).toBe(false);
  });

  it("queues an immediate refill when the song changes during one in flight", async () => {
    let finishFirst!: () => void;
    vi.mocked(refillPlaybackQueue)
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            finishFirst = () => resolve(0);
          }),
      )
      .mockResolvedValue(0);
    const orchestrator = { clearPrefetchedNext: vi.fn() };
    const { rerender } = renderHook(
      ({ songId }) =>
        usePrefetchNext(orchestrator as never, {
          songId,
          playing: true,
          paused: false,
          progress: 0,
        }),
      { initialProps: { songId: "song-a" } },
    );
    await waitFor(() => expect(refillPlaybackQueue).toHaveBeenCalledTimes(1));

    rerender({ songId: "song-b" });
    finishFirst();

    await waitFor(() => expect(refillPlaybackQueue).toHaveBeenCalledTimes(2));
  });
});

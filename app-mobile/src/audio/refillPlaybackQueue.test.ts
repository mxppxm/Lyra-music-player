import { beforeEach, describe, expect, it, vi } from "vitest";
import { LyraAudio } from "@lyra/platform-ios";
import {
  invalidatePlaybackQueueRefills,
  refillPlaybackQueue,
} from "./refillPlaybackQueue";

vi.mock("@lyra/platform-ios", () => ({
  LyraAudio: {
    getPlaybackQueueInfo: vi.fn(async () => ({ count: 0, songIds: [] })),
    appendToPlaybackQueue: vi.fn(async () => ({ count: 1, appended: 1 })),
  },
}));

describe("refillPlaybackQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not append a batch resolved after the native queue was reset", async () => {
    let resolveTracks!: (tracks: Array<Record<string, unknown>>) => void;
    const orchestrator = {
      prefetchMore: vi.fn(
        () =>
          new Promise<Array<Record<string, unknown>>>((resolve) => {
            resolveTracks = resolve;
          }),
      ),
    };
    const refill = refillPlaybackQueue(orchestrator as never);
    await vi.waitFor(() =>
      expect(orchestrator.prefetchMore).toHaveBeenCalledTimes(1),
    );

    invalidatePlaybackQueueRefills();
    resolveTracks([
      {
        url: "https://audio.example/next.mp3",
        songId: "next",
        title: "Next",
        artist: "Lyra",
        durationMs: 120_000,
      },
    ]);
    await refill;

    expect(LyraAudio.appendToPlaybackQueue).not.toHaveBeenCalled();
  });
});

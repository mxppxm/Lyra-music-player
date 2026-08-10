import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LyraAudio } from "@lyra/platform-ios";
import { useAutoAdvance } from "./useAutoAdvance";

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

vi.mock("@lyra/platform", () => ({
  getLyraPlatform: () => ({
    onComplete: vi.fn(() => () => {}),
  }),
}));

vi.mock("@lyra/platform-ios", () => ({
  LyraAudio: {
    drainNativeAdvanced: vi.fn(async () => ({
      events: [{ songId: "stale-b" }, { songId: "stale-c" }],
    })),
    getCurrentTrack: vi.fn(async () => ({
      songId: "live-d",
      isPlaying: true,
      playbackId: 9,
    })),
    getPendingEnded: vi.fn(async () => ({ playbackId: null })),
    getPlaybackQueueInfo: vi.fn(async () => ({ count: 0, songIds: [] })),
    acknowledgeEnded: vi.fn(async () => {}),
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

describe("useAutoAdvance native reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reconciles Orchestrator once to the live native songId, not every drained event", async () => {
    const onNativeAutoAdvanced = vi.fn(async () => {});
    const orchestrator = { onNativeAutoAdvanced, onSongComplete: vi.fn() };

    renderHook(() =>
      useAutoAdvance(orchestrator as never, undefined, {
        songId: "stale-a",
        playing: true,
        paused: false,
        progress: 0.4,
      }),
    );

    await waitFor(() => expect(onNativeAutoAdvanced).toHaveBeenCalledTimes(1));
    expect(onNativeAutoAdvanced).toHaveBeenCalledWith("live-d");
    expect(LyraAudio.drainNativeAdvanced).toHaveBeenCalled();
    expect(LyraAudio.getCurrentTrack).toHaveBeenCalled();
  });

  it("does nothing when Orchestrator already matches native", async () => {
    vi.mocked(LyraAudio.getCurrentTrack).mockResolvedValueOnce({
      songId: "same",
      isPlaying: true,
      playbackId: 1,
    });
    const onNativeAutoAdvanced = vi.fn(async () => {});
    const orchestrator = { onNativeAutoAdvanced, onSongComplete: vi.fn() };

    renderHook(() =>
      useAutoAdvance(orchestrator as never, undefined, {
        songId: "same",
        playing: true,
        paused: false,
        progress: 0.4,
      }),
    );

    await waitFor(() => expect(LyraAudio.getCurrentTrack).toHaveBeenCalled());
    expect(onNativeAutoAdvanced).not.toHaveBeenCalled();
  });
});

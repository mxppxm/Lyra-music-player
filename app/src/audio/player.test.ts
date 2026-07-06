import { describe, it, expect, vi, beforeEach } from "vitest";
import { playFile, stopPlayback, isPlaying } from "./player";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("audio/player", () => {
  it("playFile calls audio_play command with path", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await playFile("/tmp/song.mp3");
    expect(invokeMock).toHaveBeenCalledWith("audio_play", { path: "/tmp/song.mp3" });
  });

  it("stopPlayback calls audio_stop", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await stopPlayback();
    expect(invokeMock).toHaveBeenCalledWith("audio_stop");
  });

  it("isPlaying returns boolean from audio_is_playing", async () => {
    invokeMock.mockResolvedValueOnce(true);
    await expect(isPlaying()).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("audio_is_playing");
  });

  it("playFile propagates errors from Rust", async () => {
    invokeMock.mockRejectedValueOnce("not initialized");
    await expect(playFile("/x")).rejects.toBe("not initialized");
  });
});

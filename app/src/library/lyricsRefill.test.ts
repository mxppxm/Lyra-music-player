import { describe, expect, it, beforeEach, vi } from "vitest";

const listMissingMock = vi.fn();
const getTrackMock = vi.fn();
const computeMock = vi.fn();

vi.mock("../db/repo/lyricsEmbeddingsRepo", () => ({
  listMissing: (m: string) => listMissingMock(m),
}));
vi.mock("../db/repo/libraryRepo", () => ({
  getTrack: (id: string) => getTrackMock(id),
}));
vi.mock("./computeLyricsEmbedding", () => ({
  computeLyricsEmbedding: (id: string, path: string, p: unknown) =>
    computeMock(id, path, p),
}));

import { lyricsRefill } from "./lyricsRefill";
import type { EmbeddingProvider } from "../providers/embeddingProvider";

beforeEach(() => {
  listMissingMock.mockReset();
  getTrackMock.mockReset();
  computeMock.mockReset();
});

const fakeProvider: EmbeddingProvider = {
  modelId: "zhipu:embedding-3",
  dim: 3,
  embed: vi.fn(),
};

describe("lyricsRefill", () => {
  it("returns zeros when no provider", async () => {
    const r = await lyricsRefill({ provider: null });
    expect(r).toEqual({ started: 0, succeeded: 0, failed: 0 });
  });

  it("processes each missing track", async () => {
    listMissingMock.mockResolvedValueOnce(["a", "b", "c"]);
    getTrackMock.mockImplementation(async (id: string) => ({
      id,
      path: `/${id}.mp3`,
    }));
    computeMock.mockResolvedValue(true);
    const r = await lyricsRefill({ provider: fakeProvider, concurrency: 2 });
    expect(r.started).toBe(3);
    expect(r.succeeded).toBe(3);
    expect(r.failed).toBe(0);
    expect(computeMock).toHaveBeenCalledTimes(3);
  });

  it("counts failures per track", async () => {
    listMissingMock.mockResolvedValueOnce(["a", "b"]);
    getTrackMock.mockImplementation(async (id: string) => ({
      id,
      path: `/${id}.mp3`,
    }));
    computeMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const r = await lyricsRefill({ provider: fakeProvider, concurrency: 2 });
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
  });

  it("caps concurrency at the requested value", async () => {
    listMissingMock.mockResolvedValueOnce(["a", "b", "c", "d", "e"]);
    getTrackMock.mockImplementation(async (id: string) => ({
      id,
      path: `/${id}.mp3`,
    }));
    let inflight = 0;
    let maxInflight = 0;
    computeMock.mockImplementation(async () => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return true;
    });
    await lyricsRefill({ provider: fakeProvider, concurrency: 2 });
    expect(maxInflight).toBeLessThanOrEqual(2);
  });
});

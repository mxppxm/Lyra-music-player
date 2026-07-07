import { describe, expect, it, beforeEach, vi } from "vitest";

const lyricsExtractMock = vi.fn();
vi.mock("./lyricsExtract", () => ({
  lyricsExtract: (p: string) => lyricsExtractMock(p),
}));

const upsertMock = vi.fn();
vi.mock("../db/repo/lyricsEmbeddingsRepo", () => ({
  upsert: (r: unknown) => upsertMock(r),
}));

import { computeLyricsEmbedding } from "./computeLyricsEmbedding";
import type { EmbeddingProvider } from "../providers/embeddingProvider";

beforeEach(() => {
  lyricsExtractMock.mockReset();
  upsertMock.mockReset();
});

const fakeProvider: EmbeddingProvider = {
  modelId: "zhipu:embedding-3",
  dim: 3,
  embed: vi.fn(async () => Float32Array.from([1, 2, 3])),
};

describe("computeLyricsEmbedding", () => {
  it("returns false when no provider", async () => {
    lyricsExtractMock.mockResolvedValueOnce("some lyrics");
    const ok = await computeLyricsEmbedding("t1", "/song.mp3", null);
    expect(ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns false when no lyrics", async () => {
    lyricsExtractMock.mockResolvedValueOnce(null);
    const ok = await computeLyricsEmbedding("t1", "/song.mp3", fakeProvider);
    expect(ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("writes row on happy path", async () => {
    lyricsExtractMock.mockResolvedValueOnce("dawn light");
    const ok = await computeLyricsEmbedding("t1", "/song.mp3", fakeProvider);
    expect(ok).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const row = upsertMock.mock.calls[0][0] as {
      trackId: string;
      modelId: string;
      dim: number;
      embedding: Float32Array;
      lyricsHash: string;
    };
    expect(row.trackId).toBe("t1");
    expect(row.modelId).toBe("zhipu:embedding-3");
    expect(row.dim).toBe(3);
    expect(Array.from(row.embedding)).toEqual([1, 2, 3]);
    expect(row.lyricsHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("returns false when embed throws", async () => {
    lyricsExtractMock.mockResolvedValueOnce("dawn light");
    const angry: EmbeddingProvider = {
      modelId: "test",
      dim: 3,
      embed: vi.fn(async () => {
        throw new Error("network");
      }),
    };
    const ok = await computeLyricsEmbedding("t1", "/song.mp3", angry);
    expect(ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns false when upsert throws", async () => {
    lyricsExtractMock.mockResolvedValueOnce("dawn light");
    upsertMock.mockRejectedValueOnce(new Error("sql"));
    const ok = await computeLyricsEmbedding("t1", "/song.mp3", fakeProvider);
    expect(ok).toBe(false);
  });
});

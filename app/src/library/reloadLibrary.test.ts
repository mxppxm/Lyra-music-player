import { describe, it, expect, vi, beforeEach } from "vitest";

const stopPlaybackMock = vi.fn();
vi.mock("../audio/player", () => ({
  stopPlayback: (...args: unknown[]) => stopPlaybackMock(...args),
}));

const executeMock = vi.fn();
vi.mock("../db/client", () => ({
  getDb: async () => ({ execute: (...args: unknown[]) => executeMock(...args) }),
}));

const importLibraryMock = vi.fn();
vi.mock("./libraryScan", () => ({
  importLibrary: (...args: unknown[]) => importLibraryMock(...args),
}));

const getSecretMock = vi.fn();
vi.mock("../settings/secrets", () => ({
  SECRET_KEYS: { libraryRootPath: "library.rootPath" },
  getSecret: (...args: unknown[]) => getSecretMock(...args),
}));

import { reloadLibrary } from "./reloadLibrary";

beforeEach(() => {
  stopPlaybackMock.mockReset();
  executeMock.mockReset();
  importLibraryMock.mockReset();
  getSecretMock.mockReset();
});

describe("reloadLibrary", () => {
  it("returns no-root when the library path secret is unset", async () => {
    getSecretMock.mockResolvedValueOnce(null);
    const result = await reloadLibrary();
    expect(result.kind).toBe("no-root");
    expect(executeMock).not.toHaveBeenCalled();
    expect(importLibraryMock).not.toHaveBeenCalled();
  });

  it("clears the three library tables then re-imports and returns done", async () => {
    getSecretMock.mockResolvedValueOnce("/Users/x/Music");
    stopPlaybackMock.mockResolvedValueOnce(undefined);
    executeMock.mockResolvedValue(undefined);
    importLibraryMock.mockResolvedValueOnce({ imported: 7, pruned: 0 });

    const progress: string[] = [];
    const result = await reloadLibrary((p) => progress.push(p.kind));

    expect(result).toEqual({ kind: "done", imported: 7, pruned: 0 });
    expect(stopPlaybackMock).toHaveBeenCalledOnce();
    const deleteStatements = executeMock.mock.calls.map((c) => c[0]);
    expect(deleteStatements).toEqual([
      "DELETE FROM library_lyrics_embeddings",
      "DELETE FROM library_features",
      "DELETE FROM library_tracks",
    ]);
    expect(importLibraryMock).toHaveBeenCalledWith("/Users/x/Music");
    expect(progress).toEqual(["starting", "clearing", "scanning", "done"]);
  });

  it("surfaces pruned count when importLibrary self-heals stale rows", async () => {
    getSecretMock.mockResolvedValueOnce("/lib");
    stopPlaybackMock.mockResolvedValueOnce(undefined);
    executeMock.mockResolvedValue(undefined);
    importLibraryMock.mockResolvedValueOnce({ imported: 3, pruned: 2 });

    const result = await reloadLibrary();
    expect(result).toEqual({ kind: "done", imported: 3, pruned: 2 });
  });

  it("returns failed with the error message when a step throws", async () => {
    getSecretMock.mockResolvedValueOnce("/lib");
    stopPlaybackMock.mockResolvedValueOnce(undefined);
    executeMock.mockRejectedValueOnce(new Error("db locked"));

    const result = await reloadLibrary();
    expect(result).toEqual({ kind: "failed", message: "db locked" });
    expect(importLibraryMock).not.toHaveBeenCalled();
  });

  it("swallows a stopPlayback rejection so the reload still proceeds", async () => {
    getSecretMock.mockResolvedValueOnce("/lib");
    stopPlaybackMock.mockRejectedValueOnce(new Error("no active sink"));
    executeMock.mockResolvedValue(undefined);
    importLibraryMock.mockResolvedValueOnce({ imported: 0, pruned: 0 });

    const result = await reloadLibrary();
    expect(result).toEqual({ kind: "done", imported: 0, pruned: 0 });
  });
});
